import {
  CLASS_DEFS, LEVEL_TIER_COLORS, levelTier, ZONES, PARTY_MAX, NAME_MAX,
  type CharClass, type PartyEvent, type PartyInviteEvent, type PartyMemberInfo,
} from "@frixep/shared";

/**
 * Grupo (party) em DOM, no mesmo estilo da HUD (molduras de cantos suaves, ouro velho sobre azul-noite, Cinzel):
 *  - painel no canto esquerdo, abaixo do retrato: um cartão por membro (selo de nível com a borda da faixa, nome, coroa do líder,
 *    barras pequenas de vida e do recurso da classe, zona do membro ou "ausente"), botões Convidar (+) e Sair, e recolher;
 *  - aviso de convite/pedido com Aceitar/Recusar e contagem regressiva;
 *  - menu do jogador (clicar no nome no mapa): opções de MMO ainda desligadas e as de grupo ligadas.
 * Todo texto de jogador entra por textContent (nunca innerHTML); o servidor é quem decide tudo.
 */
export interface PartyOptions {
  /** manda um pedido ao servidor (Msg.Party*) */
  send(type: string, payload: unknown): void;
  /** nome da zona em que o jogador está agora (para só mostrar a zona de quem está em outra) */
  getZone(): number;
  myName: string;
  /** o menu do jogador selecionado foi fechado (Esc, X ou uma opção escolhida) */
  onMenuClose?(): void;
}
export interface MenuTarget { name: string; level: number; cls: string; inParty: boolean }
export interface PartyUi {
  setParty(ev: PartyEvent): void;
  showInvite(ev: PartyInviteEvent): void;
  endInvite(): void;
  /** abre o menu do jogador ao lado de (x, y) em pixels da tela */
  openPlayerMenu(t: MenuTarget, x: number, y: number): void;
  /** jogador selecionado no mundo: as opções aparecem fixas ao lado do retrato do próprio jogador (HUD) */
  selectPlayer(t: MenuTarget): void;
  closeMenu(): void;
  setTouch(on: boolean): void;
  /** o jogador está em grupo, e é o líder? (o cliente só usa para habilitar botões; o servidor valida de verdade) */
  state(): { inParty: boolean; leader: boolean; size: number };
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const mixWhite = (n: number, t: number) => {
  const c = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + 255 * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

const CSS = `
.pt{position:fixed;z-index:15;left:max(12px,env(safe-area-inset-left));top:calc(max(12px,env(safe-area-inset-top)) + 128px);width:min(232px,54vw);
  font-family:"Cinzel",Georgia,serif;color:#e6eef9;pointer-events:none;--gold:#c9a45c;--gold-d:#7a5f2e;--ink:#0c121c;--ink2:#161f2e}
.pt-tog{pointer-events:auto;position:relative;display:grid;place-items:center;width:30px;height:30px;padding:0;border-radius:8px;cursor:pointer;color:#e9c98a;
  background:linear-gradient(180deg,rgba(34,48,74,.88),rgba(13,21,34,.88));border:2px solid var(--gold-d);box-shadow:0 0 0 1px #000,0 2px 6px rgba(0,0,0,.55);
  font:700 18px/1 "Cinzel",Georgia,serif;opacity:.75;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.pt-tog:hover,.pt.open .pt-tog{opacity:1;border-color:#f0cf86}
.pt-tog:focus-visible{outline:2px solid #ffd9a0;outline-offset:2px}
.pt-tog b{position:absolute;right:-6px;top:-6px;min-width:15px;height:15px;padding:0 3px;box-sizing:border-box;border-radius:8px;background:#2e7a45;border:1px solid #000;color:#fff;font:700 9px/13px "Cinzel",Georgia,serif;text-align:center;display:none}
.pt.in .pt-tog b{display:block}
.pt-body{display:none;margin-top:6px}
.pt.open .pt-body{display:block}
.pt-head{pointer-events:auto;display:flex;align-items:center;gap:6px;height:28px;padding:0 6px 0 10px;border-radius:10px;cursor:pointer;user-select:none;
  background:linear-gradient(180deg,var(--ink2),var(--ink));border:2px solid var(--gold-d);box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,225,160,.22),0 4px 12px rgba(0,0,0,.6)}
.pt-title{flex:1;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#f0dfb8;text-shadow:0 1px 3px #000;white-space:nowrap}
.pt-title small{margin-left:6px;font-weight:600;letter-spacing:.08em;color:#9fb4cf}
.pt-b{display:grid;place-items:center;min-width:24px;height:20px;padding:0 6px;border-radius:6px;border:1px solid var(--gold-d);cursor:pointer;color:#e9c98a;
  background:linear-gradient(180deg,#22304a,#0d1522);font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.pt-b:hover{border-color:#f0cf86}
.pt-b:active{transform:scale(.95)}
.pt-b:disabled{opacity:.4;cursor:default}
.pt-b.danger{color:#ffb0a0}
.pt-add{display:none;pointer-events:auto;margin-top:6px;gap:4px}
.pt.adding .pt-add{display:flex}
.pt-in{flex:1;min-width:0;box-sizing:border-box;height:28px;padding:0 8px;border-radius:8px;border:2px solid var(--gold);background:linear-gradient(180deg,var(--ink2),var(--ink));
  color:#f4ecd8;font:600 12px/1 "Cinzel",Georgia,serif;outline:none}
.pt-in::placeholder{color:#7d8aa0}
.pt-list{display:flex;flex-direction:column;gap:5px;margin-top:6px}
.pt-row{pointer-events:auto;position:relative;display:flex;gap:7px;align-items:center;padding:5px 7px 5px 6px;border-radius:10px;
  background:linear-gradient(180deg,rgba(22,31,46,.94),rgba(12,18,28,.94));border:2px solid var(--gold-d);box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,225,160,.16),0 3px 8px rgba(0,0,0,.55)}
.pt-row.me{border-color:#5f87b8}
.pt-row.menu{cursor:pointer}
.pt-row.menu:hover{border-color:#f0cf86}
.pt-lv{flex:none;min-width:24px;height:24px;padding:0 3px;display:grid;place-items:center;border-radius:6px;background:#0d1420;border:3px solid var(--tc,#9a8460);box-shadow:0 0 0 1px #000;
  font:900 12px/1 "Cinzel",Georgia,serif;color:var(--tl,#dccfb0);text-shadow:0 1px 2px #000}
.pt-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.pt-line{display:flex;align-items:center;gap:4px;min-width:0}
.pt-nm{flex:1;min-width:0;font:700 11px/1.1 "Cinzel",Georgia,serif;letter-spacing:.06em;color:#f0dfb8;text-shadow:0 1px 3px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-crown{flex:none;display:none;color:#f0c34a}
.pt-row.lead .pt-crown{display:block}
.pt-zone{flex:none;max-width:84px;font:600 9px/1 "Cinzel",Georgia,serif;letter-spacing:.04em;color:#9fb4cf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-bar{position:relative;height:6px;border-radius:3px;overflow:hidden;background:#06090f;border:1px solid #2b3446}
.pt-bar i{position:absolute;inset:0;transform-origin:left;transform:scaleX(0);transition:transform .2s}
.pt-bar.hp i{background:linear-gradient(180deg,#6fe08a,#2e9a52)}
.pt-bar.rs{height:4px}
.pt-row.off{opacity:.55}
.pt-row.off .pt-zone{color:#ffb3a6}
.pt-row.dead .pt-nm{text-decoration:line-through;color:#c98a80}
.pt-row.dead .pt-bar.hp i{background:#7a2e2e}
/* ---------- convite ---------- */
.pt-inv{position:fixed;z-index:18;left:50%;top:calc(max(12px,env(safe-area-inset-top)) + 150px);transform:translateX(-50%);width:min(330px,92vw);display:none;flex-direction:column;gap:8px;padding:12px 14px;
  border-radius:12px;font-family:"Cinzel",Georgia,serif;text-align:center;pointer-events:auto;background:linear-gradient(180deg,#1b2840,#0c121c);border:2px solid var(--gold,#c9a45c);
  box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,225,160,.25),0 10px 26px rgba(0,0,0,.7)}
.pt-inv.on{display:flex}
.pt-inv-t{font:700 13px/1.35 "Cinzel",Georgia,serif;color:#f4ecd8;text-shadow:0 1px 3px #000;word-break:break-word}
.pt-inv-t b{color:#f0dfb8}
.pt-inv-btns{display:flex;gap:10px;justify-content:center}
.pt-inv-btns .pt-b{height:34px;min-width:96px;font-size:12px}
.pt-inv-btns .ok{color:#b8f0c4;border-color:#4a8a5a}
.pt-inv-time{height:4px;border-radius:2px;overflow:hidden;background:#06090f}
.pt-inv-time i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#8d6a2a,#e9c98a);transform-origin:left}
/* ---------- menu do jogador ---------- */
.pt-menu{position:fixed;z-index:19;min-width:200px;max-width:min(260px,92vw);padding:8px;display:none;flex-direction:column;gap:3px;border-radius:12px;font-family:"Cinzel",Georgia,serif;
  background:linear-gradient(180deg,#1b2840,#0c121c);border:2px solid #c9a45c;box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,225,160,.25),0 10px 26px rgba(0,0,0,.7)}
.pt-menu.on{display:flex}
.pt-menu.dock{left:calc(max(12px,env(safe-area-inset-left)) + min(300px,64vw) + 12px);top:max(12px,env(safe-area-inset-top));max-height:calc(100dvh - max(12px,env(safe-area-inset-top)) - 12px);overflow-y:auto;overscroll-behavior:contain;z-index:17}
.pt-menu .pt-x{position:absolute;right:6px;top:6px;width:24px;height:24px;padding:0;border-radius:6px;border:1px solid var(--gold-d,#7a5f2e);background:transparent;color:#cfdcec;cursor:pointer;font:700 12px/1 Georgia,serif}
@media (max-width:640px),(pointer:coarse) and (max-width:900px){.pt-menu.dock{left:max(12px,env(safe-area-inset-left));top:calc(max(12px,env(safe-area-inset-top)) + 176px);max-height:calc(100dvh - max(12px,env(safe-area-inset-top)) - 188px);max-width:min(260px,62vw)}}
.pt-menu-h{display:flex;align-items:center;gap:8px;padding:2px 4px 8px;border-bottom:1px solid rgba(201,164,92,.35);margin-bottom:4px}
.pt-menu-h .nm{font:700 13px/1.1 "Cinzel",Georgia,serif;letter-spacing:.06em;color:#f0dfb8;word-break:break-word}
.pt-menu-h .sub{font:600 10px/1.2 "Cinzel",Georgia,serif;color:#9fb4cf;letter-spacing:.06em}
.pt-mi{display:block;width:100%;text-align:left;padding:8px 10px;border-radius:8px;border:1px solid transparent;background:transparent;cursor:pointer;color:#e6eef9;
  font:600 12px/1.1 "Cinzel",Georgia,serif;letter-spacing:.05em;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.pt-mi:hover:not(:disabled){background:rgba(201,164,92,.16);border-color:var(--gold-d,#7a5f2e)}
.pt-mi:disabled{color:#6c7788;cursor:default}
.pt-mi.sep{margin-top:4px}
.pt-mi{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.pt-mi small{flex:none;font:600 9px/1.2 "Cinzel",Georgia,serif;color:#7d8aa0;letter-spacing:.04em;text-align:right}
@media (pointer:coarse){.pt-mi{padding:11px 10px}.pt-b{min-width:30px;height:24px}.pt-head{height:32px}}
@media (max-height:480px){.pt-row{padding:3px 6px}.pt-mid{gap:2px}.pt-mi,.pt-menu .pt-mi{padding:7px 10px}.pt-menu-h{padding-bottom:5px}}
`;

const ICON_CROWN = `<svg viewBox="0 0 16 16" width="12" height="12" shape-rendering="crispEdges"><path fill="currentColor" d="M1 5h2v2h1V4h2V3h1V2h2v1h1v1h2v3h1V5h2v7H1z"/></svg>`;

export function mountParty(opts: PartyOptions): PartyUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement("div");
  root.className = "pt";
  const head = document.createElement("div");
  head.className = "pt-head";
  head.title = "Grupo (clique para fechar)";
  const title = document.createElement("div");
  title.className = "pt-title";
  const titleTxt = document.createElement("span");
  titleTxt.textContent = "Grupo";
  const count = document.createElement("small");
  title.append(titleTxt, count);
  const addBtn = btn("+", "Convidar jogador (ou digite /pt nome)");
  const leaveBtn = btn("Sair", "Sair do grupo");
  leaveBtn.classList.add("danger");
  leaveBtn.style.display = "none";
  head.append(title, addBtn, leaveBtn);
  const add = document.createElement("form");
  add.className = "pt-add";
  const input = document.createElement("input");
  input.className = "pt-in";
  input.type = "text";
  input.maxLength = NAME_MAX;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Nome do jogador";
  input.setAttribute("aria-label", "Nome do jogador para convidar");
  const go = btn("Ir", "Enviar convite");
  go.type = "submit";
  add.append(input, go);
  const list = document.createElement("div");
  list.className = "pt-list";
  const tog = document.createElement("button");
  tog.type = "button";
  tog.className = "pt-tog";
  tog.title = "Grupo";
  tog.setAttribute("aria-label", "Abrir ou fechar o painel de grupo");
  tog.setAttribute("aria-expanded", "false");
  const togIc = document.createElement("span");
  togIc.textContent = "+";
  const togN = document.createElement("b");
  tog.append(togIc, togN);
  const body = document.createElement("div");
  body.className = "pt-body";
  body.append(head, add, list);
  root.append(tog, body); // o painel nasce recolhido: só o quadradinho "+" fica na tela
  document.body.append(root);

  function btn(text: string, label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pt-b";
    b.textContent = text;
    b.title = label;
    b.setAttribute("aria-label", label);
    return b;
  }

  // ---------------------------------------------------------------- estado e linhas
  let members: PartyMemberInfo[] = [];
  const rows = new Map<string, { el: HTMLElement; lv: HTMLElement; nm: HTMLElement; zone: HTMLElement; hp: HTMLElement; rs: HTMLElement; sig: string }>();
  const meInfo = () => members.find((m) => m.name === opts.myName);

  const stop = (e: Event) => e.stopPropagation();
  const setOpen = (on: boolean) => {
    root.classList.toggle("open", on);
    togIc.textContent = on ? "−" : "+";
    tog.setAttribute("aria-expanded", String(on));
    if (!on) root.classList.remove("adding");
  };
  tog.addEventListener("click", () => setOpen(!root.classList.contains("open")));
  head.addEventListener("click", () => setOpen(false));
  for (const b of [addBtn, leaveBtn, go]) b.addEventListener("click", stop);
  add.addEventListener("click", stop);
  addBtn.addEventListener("click", () => {
    root.classList.toggle("adding");
    if (root.classList.contains("adding")) input.focus();
  });
  leaveBtn.addEventListener("click", () => opts.send("party_leave", {}));
  add.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = input.value.trim();
    if (n) opts.send("party_invite", { name: n });
    input.value = "";
    root.classList.remove("adding");
    input.blur();
  });
  // digitar no campo não aciona as teclas de combate
  for (const t of ["keydown", "keyup"] as const) input.addEventListener(t, (e) => {
    e.stopPropagation();
    if (t === "keydown" && (e as KeyboardEvent).key === "Escape") { root.classList.remove("adding"); input.blur(); }
  }, true);

  function makeRow(name: string) {
    const el = document.createElement("div");
    el.className = "pt-row";
    const lv = document.createElement("div");
    lv.className = "pt-lv";
    const mid = document.createElement("div");
    mid.className = "pt-mid";
    const line = document.createElement("div");
    line.className = "pt-line";
    const nm = document.createElement("span");
    nm.className = "pt-nm";
    const crown = document.createElement("span");
    crown.className = "pt-crown";
    crown.title = "Líder do grupo";
    crown.innerHTML = ICON_CROWN; // ícone fixo do próprio código
    const zone = document.createElement("span");
    zone.className = "pt-zone";
    line.append(nm, crown, zone);
    const hpB = document.createElement("div");
    hpB.className = "pt-bar hp";
    const hp = document.createElement("i");
    hpB.append(hp);
    const rsB = document.createElement("div");
    rsB.className = "pt-bar rs";
    const rs = document.createElement("i");
    rsB.append(rs);
    mid.append(line, hpB, rsB);
    el.append(lv, mid);
    el.addEventListener("click", (e) => {
      const m = members.find((x) => x.name === name);
      const me = meInfo();
      if (!m || !me?.leader || m.name === me.name) return; // só o líder mexe nos outros
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      openMenu({ name: m.name, level: m.level, cls: m.cls, inParty: true }, r.right + 6, r.top, "member");
    });
    return { el, lv, nm, zone, hp, rs, sig: "" };
  }

  function render() {
    const inParty = members.length > 0;
    root.classList.toggle("in", inParty);
    leaveBtn.style.display = inParty ? "" : "none";
    count.textContent = inParty ? `${members.length}/${PARTY_MAX}` : "";
    togN.textContent = String(members.length);
    const me = meInfo();
    addBtn.style.display = !inParty || me?.leader ? "" : "none"; // só o líder (ou quem não tem grupo) convida
    addBtn.disabled = inParty && members.length >= PARTY_MAX;
    const names = new Set(members.map((m) => m.name));
    for (const [n, r] of rows) if (!names.has(n)) { r.el.remove(); rows.delete(n); }
    for (const m of members) {
      let r = rows.get(m.name);
      if (!r) { r = makeRow(m.name); rows.set(m.name, r); }
      list.append(r.el); // append reordena na ordem do servidor (a de entrada)
      const tier = levelTier(m.level);
      const sig = `${tier}`;
      if (r.sig !== sig) { // cores da faixa de nível (mesmas da placa e do retrato)
        r.sig = sig;
        r.lv.style.setProperty("--tc", hex(LEVEL_TIER_COLORS[tier]));
        r.lv.style.setProperty("--tl", mixWhite(LEVEL_TIER_COLORS[tier], 0.55));
      }
      r.lv.textContent = String(m.level);
      r.nm.textContent = m.name;
      const away = m.zone === 0;
      r.zone.textContent = away ? "ausente" : m.zone !== opts.getZone() ? (ZONES[m.zone]?.name ?? "outra zona") : "";
      r.hp.style.transform = `scaleX(${m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0})`;
      const res = CLASS_DEFS[m.cls as CharClass]?.resource;
      r.rs.style.background = res ? hex(res.color) : "#4aa8ff";
      r.rs.style.transform = `scaleX(${m.maxMana > 0 ? Math.max(0, Math.min(1, m.mana / m.maxMana)) : 0})`;
      r.el.classList.toggle("lead", m.leader);
      r.el.classList.toggle("me", m.name === opts.myName);
      r.el.classList.toggle("off", away);
      r.el.classList.toggle("dead", m.dead && !away);
      r.el.classList.toggle("menu", !!me?.leader && m.name !== opts.myName);
      r.el.title = m.name === opts.myName ? "Você" : me?.leader ? "Clique para passar a liderança ou expulsar" : m.name;
    }
  }

  // ---------------------------------------------------------------- convite
  const inv = document.createElement("div");
  inv.className = "pt-inv";
  inv.setAttribute("role", "alertdialog");
  const invT = document.createElement("div");
  invT.className = "pt-inv-t";
  const invBtns = document.createElement("div");
  invBtns.className = "pt-inv-btns";
  const ok = btn("Aceitar", "Aceitar");
  ok.classList.add("ok");
  const no = btn("Recusar", "Recusar");
  invBtns.append(ok, no);
  const invTime = document.createElement("div");
  invTime.className = "pt-inv-time";
  const invFill = document.createElement("i");
  invTime.append(invFill);
  inv.append(invT, invBtns, invTime);
  document.body.append(inv);
  let invTimer: ReturnType<typeof setTimeout> | undefined;
  ok.addEventListener("click", () => { opts.send("party_accept", {}); endInvite(); });
  no.addEventListener("click", () => { opts.send("party_decline", {}); endInvite(); });
  function endInvite() {
    clearTimeout(invTimer);
    inv.classList.remove("on");
  }

  // ---------------------------------------------------------------- menu do jogador
  const menu = document.createElement("div");
  menu.className = "pt-menu";
  menu.setAttribute("role", "menu");
  document.body.append(menu);
  let docked = false;
  function closeMenu() {
    const was = menu.classList.contains("on");
    menu.classList.remove("on", "dock");
    menu.style.left = menu.style.top = "";
    const d = docked;
    docked = false;
    if (was && d) opts.onMenuClose?.();
  }
  function item(label: string, onClick: (() => void) | null, hint?: string, sep = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pt-mi" + (sep ? " sep" : "");
    b.setAttribute("role", "menuitem");
    b.textContent = label;
    if (hint) { const s = document.createElement("small"); s.textContent = hint; b.append(s); }
    if (!onClick) b.disabled = true;
    else b.addEventListener("click", () => { closeMenu(); onClick(); });
    return b;
  }
  /** denúncia: pede o motivo (até 200 caracteres) e envia; o servidor grava e limita a 1 por minuto */
  function denunciar(nome: string) {
    const motivo = window.prompt(`Denunciar ${nome}. Motivo (até 200 caracteres):`);
    if (motivo?.trim()) opts.send("report", { name: nome, motivo: motivo.trim().slice(0, 200) });
  }
  function openMenu(t: MenuTarget, x: number, y: number, mode: "player" | "member" | "dock") {
    menu.classList.remove("dock");
    docked = false;
    menu.replaceChildren();
    const h = document.createElement("div");
    h.className = "pt-menu-h";
    const lv = document.createElement("div");
    lv.className = "pt-lv";
    const tier = levelTier(t.level);
    lv.style.setProperty("--tc", hex(LEVEL_TIER_COLORS[tier]));
    lv.style.setProperty("--tl", mixWhite(LEVEL_TIER_COLORS[tier], 0.55));
    lv.textContent = String(t.level);
    const who = document.createElement("div");
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = t.name;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${CLASS_DEFS[t.cls as CharClass]?.name ?? "Aventureiro"}${t.inParty ? " · em grupo" : ""}`;
    who.append(nm, sub);
    h.append(lv, who);
    menu.append(h);
    if (mode === "dock") {
      const xb = document.createElement("button");
      xb.type = "button";
      xb.className = "pt-x";
      xb.setAttribute("aria-label", "Fechar opções");
      xb.textContent = "✕";
      xb.addEventListener("click", closeMenu);
      menu.append(xb);
    }
    const send = (type: string) => () => opts.send(type, { name: t.name });
    if (mode === "member") {
      menu.append(item("Passar liderança", send("party_lead")), item("Expulsar do grupo", send("party_kick")));
    } else {
      const s = state();
      const soon = "Em breve";
      const canInvite = (!s.inParty || s.leader) && s.size < PARTY_MAX && !t.inParty;
      const inviteWhy = t.inParty ? "Já está em um grupo" : s.inParty && !s.leader ? "Só o líder convida" : s.size >= PARTY_MAX ? "Seu grupo está cheio" : undefined;
      menu.append(
        item("Convidar para grupo", canInvite ? send("party_invite") : null, inviteWhy, true),
        item("Pedir para entrar no grupo", !s.inParty ? send("party_join") : null, s.inParty ? "Você já está em um grupo" : undefined),
        item("Trocar", send("trade_invite")),
      );
      // o que ainda não existe fica por último: no celular deitado o menu rola e as ações úteis têm de aparecer primeiro
      menu.append(item("Ver Perfil", null, soon), item("Pedido de amizade", null, soon), item("Sussurrar", null, soon), item("Bloquear", null, soon));
      menu.append(item("Denunciar", () => denunciar(t.name), undefined, true)); // sempre por último no menu do jogador
    }
    menu.classList.add("on");
    if (mode === "dock") { // fixo ao lado do retrato do jogador: sem posição calculada
      docked = true;
      menu.classList.add("dock");
      menu.style.left = menu.style.top = "";
      return;
    }
    const w = menu.offsetWidth, hgt = menu.offsetHeight;
    menu.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, x))}px`;
    menu.style.top = `${Math.max(6, Math.min(window.innerHeight - hgt - 6, y))}px`;
  }
  // clicar fora (ou Esc) fecha o menu
  window.addEventListener("pointerdown", (e) => { if (menu.classList.contains("on") && !docked && !menu.contains(e.target as Node)) closeMenu(); }, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); }, true);

  function state() {
    const me = meInfo();
    return { inParty: members.length > 0, leader: !!me?.leader, size: members.length };
  }

  return {
    setParty(ev) {
      members = Array.isArray(ev?.members) ? ev.members : [];
      render();
    },
    showInvite(ev) {
      invT.replaceChildren();
      const who = document.createElement("b");
      who.textContent = String(ev.from);
      invT.append(who, ev.kind === "join" ? " pede para entrar no seu grupo." : " convida você para um grupo.");
      const ms = Math.max(1000, Math.min(60_000, Number(ev.ms) || 30_000));
      invFill.style.transition = "none";
      invFill.style.transform = "scaleX(1)";
      void invFill.offsetWidth;
      invFill.style.transition = `transform ${ms}ms linear`;
      invFill.style.transform = "scaleX(0)";
      inv.classList.add("on");
      clearTimeout(invTimer);
      invTimer = setTimeout(endInvite, ms + 400);
    },
    endInvite,
    openPlayerMenu: (t, x, y) => openMenu(t, x, y, "player"),
    selectPlayer: (t) => openMenu(t, 0, 0, "dock"),
    closeMenu,
    setTouch(on) { root.classList.toggle("touch", on); },
    state,
  };
}
