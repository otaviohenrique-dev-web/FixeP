import { Evt, PARTY_MAX, PARTY_INVITE_S, type PartyEvent, type PartyMemberInfo } from "@frixep/shared";
import { nameKey } from "../db/repo.js";
import type { Player } from "../rooms/entities.js";

/**
 * Grupos (party). O grupo vive em MEMÓRIA, num registro único do processo, porque as zonas são salas Colyseus separadas
 * e um membro pode estar em qualquer uma. LIMITAÇÃO: isso só funciona com UMA instância do servidor (a do Render hoje);
 * com várias instâncias seria preciso um armazenamento compartilhado (ex.: Redis). O grupo não vai para o banco:
 * some quando todos saem do jogo.
 *
 * A identidade do membro é o id do PERSONAGEM (não a sessão), então a travessia entre zonas não desfaz o grupo.
 * Quem cai/sai do jogo fica "ausente" por PARTY_GRACE_MS (dá tempo de recarregar a página ou atravessar um portal) e depois sai do grupo.
 */

// PARTY_TEST=1 só nos testes: convite e tolerância curtos e sem espera entre convites
const TEST = process.env.PARTY_TEST === "1";
export const INVITE_MS = TEST ? 4000 : PARTY_INVITE_S * 1000;
export const GRACE_MS = TEST ? 3000 : 45_000;
const COOLDOWN_MS = TEST ? 0 : 1500; // espera mínima entre convites do mesmo jogador (evita encher a tela dos outros)

/** Um personagem que está jogando agora (em alguma zona). */
export interface Presence {
  charId: string;
  name: string;
  sid: string;
  zone: number;
  player: Player; // o estado vivo na sala (vida, recurso, nível); o grupo marca `player.party`
  send(type: string, payload: unknown): void;
}

interface Member { charId: string; name: string; cls: string; level: number }
interface Party { id: string; leader: string; members: Member[] } // members em ordem de entrada
interface Invite { kind: "invite" | "join"; from: string; to: string; expires: number }

export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

class Parties {
  private online = new Map<string, Presence>(); // charId -> presença
  private byName = new Map<string, string>(); // nameKey -> charId (só quem está online)
  private partyOf = new Map<string, Party>(); // charId -> grupo
  private invites = new Map<string, Invite>(); // alvo (charId) -> convite pendente (um por alvo)
  private lastInviteAt = new Map<string, number>();
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastSent = new Map<string, string>(); // charId -> último PartyEvent enviado (evita reenviar igual)
  private seq = 0;
  private timer?: ReturnType<typeof setInterval>;

  // ------------------------------------------------------------------ presença (chamado pelas salas)
  attach(p: Presence) {
    this.online.set(p.charId, p);
    this.byName.set(nameKey(p.name), p.charId);
    const t = this.graceTimers.get(p.charId);
    if (t) { clearTimeout(t); this.graceTimers.delete(p.charId); }
    this.lastSent.delete(p.charId); // a sala nova precisa receber o estado completo
    const party = this.partyOf.get(p.charId);
    p.player.party = party?.id ?? "";
    if (party) this.touch(party);
    this.ensureTimer();
  }

  /** o cliente pede depois de registrar os receptores: reenvia o grupo e o convite pendente (que sobrevive a recarregar/atravessar) */
  resync(charId: string) {
    this.lastSent.delete(charId);
    const party = this.partyOf.get(charId);
    if (party) this.touch(party);
    const inv = this.invites.get(charId);
    if (inv && Date.now() < inv.expires) this.sendInvite(inv);
  }

  /** `sid` evita que a saída de uma sessão antiga derrube a presença da nova (troca de zona/aba). */
  detach(charId: string, sid: string) {
    const p = this.online.get(charId);
    if (!p || p.sid !== sid) return;
    this.online.delete(charId);
    if (this.byName.get(nameKey(p.name)) === charId) this.byName.delete(nameKey(p.name));
    this.lastSent.delete(charId);
    const party = this.partyOf.get(charId);
    if (!party) return; // convites pendentes só expiram sozinhos (quem recarrega a página ainda os vê)
    this.touch(party);
    clearTimeout(this.graceTimers.get(charId));
    this.graceTimers.set(charId, setTimeout(() => { // não voltou a tempo: sai do grupo
      this.graceTimers.delete(charId);
      if (!this.online.has(charId)) this.removeMember(charId, "ausente");
    }, GRACE_MS));
    this.graceTimers.get(charId)?.unref?.();
  }

  // ------------------------------------------------------------------ consultas
  partyIdOf(charId: string): string { return this.partyOf.get(charId)?.id ?? ""; }
  sameParty(a: string, b: string): boolean { const p = this.partyOf.get(a); return !!p && p === this.partyOf.get(b); }
  isLeader(charId: string): boolean { return this.partyOf.get(charId)?.leader === charId; }
  /** só para testes e diagnóstico */
  sizeOf(charId: string): number { return this.partyOf.get(charId)?.members.length ?? 0; }

  /** envia a todos os membros ONLINE do grupo de `charId` (qualquer zona) */
  sendToParty(charId: string, type: string, payload: unknown) {
    for (const m of this.partyOf.get(charId)?.members ?? []) this.online.get(m.charId)?.send(type, payload);
  }

  // ------------------------------------------------------------------ convites e pedidos
  /** `from` convida o jogador de nome `rawName` para o grupo de `from` (ou para um novo, em que `from` será o líder) */
  invite(from: string, rawName: unknown): Result {
    const me = this.online.get(from);
    const target = this.resolve(rawName);
    if (!me) return fail("Você não está em jogo.");
    if (!target) return fail("Jogador não encontrado (ou está offline).");
    if (target.charId === from) return fail("Você não pode convidar a si mesmo.");
    const mine = this.partyOf.get(from);
    if (mine && mine.leader !== from) return fail("Só o líder do grupo pode convidar.");
    if (mine && mine.members.length >= PARTY_MAX) return fail(`Seu grupo está cheio (máx. ${PARTY_MAX}).`);
    if (this.partyOf.has(target.charId)) return fail(`${target.name} já está em um grupo.`);
    return this.open("invite", me, target);
  }

  /** `from` pede para entrar no grupo de `rawName` (se não houver grupo, quem aceitar vira o líder) */
  requestJoin(from: string, rawName: unknown): Result {
    const me = this.online.get(from);
    const target = this.resolve(rawName);
    if (!me) return fail("Você não está em jogo.");
    if (!target) return fail("Jogador não encontrado (ou está offline).");
    if (target.charId === from) return fail("Você não pode pedir para entrar no seu próprio grupo.");
    if (this.partyOf.has(from)) return fail("Você já está em um grupo.");
    const theirs = this.partyOf.get(target.charId);
    if (theirs && theirs.members.length >= PARTY_MAX) return fail(`O grupo de ${target.name} está cheio.`);
    return this.open("join", me, target);
  }

  private open(kind: Invite["kind"], me: Presence, target: Presence): Result {
    const now = Date.now();
    const pending = this.invites.get(target.charId);
    if (pending && now < pending.expires) return fail(`${target.name} já tem um convite pendente.`);
    if (now - (this.lastInviteAt.get(me.charId) ?? 0) < COOLDOWN_MS) return fail("Calma! Espere um instante para convidar de novo.");
    this.lastInviteAt.set(me.charId, now);
    const inv: Invite = { kind, from: me.charId, to: target.charId, expires: now + INVITE_MS };
    this.invites.set(target.charId, inv);
    this.sendInvite(inv);
    me.send(Evt.Notice, { text: kind === "invite" ? `Convite enviado a ${target.name}.` : `Pedido enviado a ${target.name}.` });
    return { ok: true };
  }

  private sendInvite(inv: Invite) {
    const from = this.online.get(inv.from), to = this.online.get(inv.to);
    if (!from || !to) return;
    to.send(Evt.PartyInvite, { kind: inv.kind, from: from.name, ms: Math.max(0, inv.expires - Date.now()) });
  }

  accept(charId: string): Result {
    const inv = this.invites.get(charId);
    if (!inv || Date.now() >= inv.expires) { this.clearInvite(charId); return fail("Nenhum convite pendente."); }
    this.clearInvite(charId);
    const asker = this.online.get(inv.from), me = this.online.get(charId);
    if (!asker || !me) return fail("Quem convidou saiu do jogo.");
    // quem entra e quem recebe: no convite, `charId` entra no grupo de quem convidou; no pedido, quem pediu entra no de `charId`
    const joiner = inv.kind === "invite" ? me : asker;
    const host = inv.kind === "invite" ? asker : me;
    if (this.partyOf.has(joiner.charId)) return fail(inv.kind === "invite" ? "Você já está em um grupo." : `${joiner.name} já entrou em outro grupo.`);
    let party = this.partyOf.get(host.charId);
    if (party && inv.kind === "invite" && party.leader !== host.charId) return fail("O convite não vale mais (o líder mudou).");
    if (party && party.members.length >= PARTY_MAX) return fail("O grupo está cheio.");
    if (!party) { // grupo novo: o líder é quem convidou; no pedido sem grupo, quem aceitou
      party = { id: `g${++this.seq}`, leader: host.charId, members: [] };
      this.addMember(party, host);
    }
    this.addMember(party, joiner);
    this.say(party, `${joiner.name} entrou no grupo.`);
    this.touch(party);
    asker.send(Evt.Notice, { text: `${me.name} aceitou.` });
    return { ok: true };
  }

  decline(charId: string): Result {
    const inv = this.invites.get(charId);
    if (!inv || Date.now() >= inv.expires) { this.clearInvite(charId); return fail("Nenhum convite pendente."); }
    this.clearInvite(charId);
    const me = this.online.get(charId);
    this.online.get(inv.from)?.send(Evt.Notice, { text: `${me?.name ?? "O jogador"} recusou.` });
    return { ok: true };
  }

  // ------------------------------------------------------------------ sair, expulsar, liderança
  leave(charId: string): Result {
    if (!this.partyOf.has(charId)) return fail("Você não está em um grupo.");
    this.removeMember(charId, "saiu");
    return { ok: true };
  }

  kick(leader: string, rawName: unknown): Result {
    const party = this.partyOf.get(leader);
    if (!party) return fail("Você não está em um grupo.");
    if (party.leader !== leader) return fail("Só o líder pode expulsar.");
    const m = this.memberByName(party, rawName);
    if (!m) return fail("Esse jogador não está no seu grupo.");
    if (m.charId === leader) return fail("Você não pode expulsar a si mesmo (use Sair).");
    this.online.get(m.charId)?.send(Evt.Notice, { text: "Você foi expulso do grupo." });
    this.removeMember(m.charId, "foi expulso");
    return { ok: true };
  }

  lead(leader: string, rawName: unknown): Result {
    const party = this.partyOf.get(leader);
    if (!party) return fail("Você não está em um grupo.");
    if (party.leader !== leader) return fail("Só o líder pode passar a liderança.");
    const m = this.memberByName(party, rawName);
    if (!m || m.charId === leader) return fail("Escolha outro membro do grupo.");
    party.leader = m.charId;
    this.say(party, `${m.name} agora é o líder do grupo.`);
    this.touch(party);
    return { ok: true };
  }

  // ------------------------------------------------------------------ internos
  private resolve(raw: unknown): Presence | undefined {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 40) return undefined;
    const id = this.byName.get(nameKey(raw));
    return id ? this.online.get(id) : undefined;
  }

  private memberByName(party: Party, raw: unknown): Member | undefined {
    if (typeof raw !== "string" || raw.length > 40) return undefined;
    const k = nameKey(raw);
    return party.members.find((m) => nameKey(m.name) === k);
  }

  private addMember(party: Party, p: Presence) {
    party.members.push({ charId: p.charId, name: p.name, cls: p.player.cls, level: p.player.level });
    this.partyOf.set(p.charId, party);
    p.player.party = party.id;
  }

  private removeMember(charId: string, why: string) {
    const party = this.partyOf.get(charId);
    if (!party) return;
    const gone = party.members.find((m) => m.charId === charId);
    party.members = party.members.filter((m) => m.charId !== charId);
    this.partyOf.delete(charId);
    const t = this.graceTimers.get(charId);
    if (t) { clearTimeout(t); this.graceTimers.delete(charId); }
    const left = this.online.get(charId);
    if (left) left.player.party = "";
    this.lastSent.delete(charId);
    left?.send(Evt.Party, { members: [] } satisfies PartyEvent);
    if (party.members.length < 2) { // um grupo de um só não existe: desfaz
      for (const m of party.members) {
        this.partyOf.delete(m.charId);
        const o = this.online.get(m.charId);
        if (o) { o.player.party = ""; o.send(Evt.Notice, { text: "O grupo foi desfeito." }); o.send(Evt.Party, { members: [] } satisfies PartyEvent); }
        this.lastSent.delete(m.charId);
        const gt = this.graceTimers.get(m.charId);
        if (gt) { clearTimeout(gt); this.graceTimers.delete(m.charId); }
      }
      return;
    }
    this.say(party, `${gone?.name ?? "Um jogador"} ${why === "ausente" ? "saiu do grupo (ficou ausente)" : why === "saiu" ? "saiu do grupo" : why}.`);
    if (party.leader === charId) { // a liderança passa ao membro mais antigo que restou
      party.leader = party.members[0].charId;
      this.say(party, `${party.members[0].name} agora é o líder do grupo.`);
    }
    this.touch(party);
  }

  private say(party: Party, text: string) {
    for (const m of party.members) this.online.get(m.charId)?.send(Evt.Notice, { text });
  }

  private clearInvite(to: string) {
    if (this.invites.delete(to)) this.online.get(to)?.send(Evt.PartyInviteEnd, {});
  }

  // ------------------------------------------------------------------ estado enviado aos clientes
  private info(party: Party): PartyEvent {
    const members: PartyMemberInfo[] = party.members.map((m) => {
      const o = this.online.get(m.charId);
      if (o) { m.level = o.player.level; m.cls = o.player.cls; }
      return {
        name: m.name, cls: m.cls, level: m.level, leader: party.leader === m.charId,
        hp: o?.player.hp ?? 0, maxHp: o?.player.maxHp ?? 0, mana: o?.player.mana ?? 0, maxMana: o?.player.maxMana ?? 0,
        zone: o?.zone ?? 0, dead: !!o?.player.dead,
      };
    });
    return { members };
  }

  /** envia o estado do grupo a cada membro online cujo resumo mudou */
  private touch(party: Party) {
    const ev = this.info(party);
    const json = JSON.stringify(ev);
    for (const m of party.members) {
      if (this.lastSent.get(m.charId) === json) continue;
      const o = this.online.get(m.charId);
      if (!o) continue;
      this.lastSent.set(m.charId, json);
      o.send(Evt.Party, ev);
    }
  }

  private ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 400);
    this.timer.unref?.();
  }

  private tick() {
    const now = Date.now();
    for (const [to, inv] of this.invites) { // convites vencidos
      if (now < inv.expires) continue;
      this.clearInvite(to);
      this.online.get(inv.from)?.send(Evt.Notice, { text: `O convite para ${this.online.get(to)?.name ?? "o jogador"} expirou.` });
    }
    const seen = new Set<Party>();
    for (const party of this.partyOf.values()) {
      if (seen.has(party)) continue;
      seen.add(party);
      this.touch(party);
    }
  }
}

export const parties = new Parties();
