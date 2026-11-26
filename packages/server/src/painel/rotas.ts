import { Router, type Request, type Response, type NextFunction } from "express";
import { ITEMS, poderTotal, statsDoPersonagem, gearBonuses, type CharClass } from "@frixep/shared";
import { exigirSessao } from "../auth.js";
import { isAdmin } from "../moderacao.js";
import type { Repo } from "../db/repo.js";
import { nameKey } from "../db/repo.js";
import { jogadoresPorZona, contaOnline } from "../rooms/ZoneRoom.js";
import { painelDisponivel, mascararEmail } from "./email.js";
import { pedirCodigo, confirmarCodigo, emitirTokenPainel, contaDoTokenPainel, PAINEL_TOKEN_VALIDADE } from "./codigo.js";
import { registrarAuditoria, listarAuditoria } from "./auditoria.js";
import { aplicarSancao, estadoSancao, ACOES_SANCAO } from "./sancoes.js";

/**
 * Rotas do painel de administração (/api/admin/*). Uma rota por aba: cada fase do painel acrescenta um arquivo de rotas
 * e o monta aqui. A F1 traz: visão geral, jogadores, denúncias e auditoria.
 *
 * Regras: toda rota exige conta admin (403 se não for). Exceto as de entrada (/estado, /codigo, /sessao), toda rota
 * exige também o token do painel no cabeçalho X-Painel-Token (401 se faltar, estiver vencido ou for de outra conta).
 */

const TOKEN_HEADER = "x-painel-token";
type Handler = (req: Request, res: Response) => Promise<unknown>;

/** envolve um handler assíncrono: erro vira 500 genérico (sem detalhe técnico na resposta) */
const rota = (fn: Handler) => (req: Request, res: Response) => {
  fn(req, res).catch((e) => {
    console.error("[painel]", (e as Error).message);
    if (!res.headersSent) res.status(500).json({ error: "Erro interno." });
  });
};

/** conta admin (403 se for conta comum) */
function exigirAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.user?.id)) return res.status(403).json({ error: "Acesso restrito a administradores." });
  next();
}

/** token do painel válido e da mesma conta (401 se faltar, estiver vencido ou for de outra conta) */
function exigirTokenPainel(req: Request, res: Response, next: NextFunction) {
  contaDoTokenPainel(req.headers[TOKEN_HEADER]).then(
    (conta) => {
      if (!conta || conta !== req.user?.id) return res.status(401).json({ error: "Confirme o código do painel para continuar." });
      next();
    },
    () => res.status(401).json({ error: "Confirme o código do painel para continuar." }),
  );
}

const CONTA_ADMIN = [exigirSessao, exigirAdmin];
/** proteção completa de qualquer rota de admin do painel (sessão + conta admin + token do painel). Outras abas (ex.: balanceamento) usam esta lista. */
export const PROTEGER_PAINEL = [exigirSessao, exigirAdmin, exigirTokenPainel] as const;
const texto = (x: unknown) => (typeof x === "string" ? x : "");

export function painelRouter(repo: Repo): Router {
  const r = Router();

  // ---- entrada: estado da conta e 2FA (ainda sem token do painel)
  r.get("/estado", exigirSessao, rota(async (req, res) => {
    const admin = isAdmin(req.user?.id);
    res.json({ admin, disponivel: admin && painelDisponivel(), validadeToken: PAINEL_TOKEN_VALIDADE });
  }));

  r.post("/codigo", ...CONTA_ADMIN, rota(async (req, res) => {
    const conta = req.user!.id;
    const out = await pedirCodigo(conta, await repo.emailDaConta(conta));
    if (!out.ok) return res.status(out.status).json({ error: out.erro });
    res.json({ enviado: true, expiraEm: out.expiraEm });
  }));

  r.post("/sessao", ...CONTA_ADMIN, rota(async (req, res) => {
    const conta = req.user!.id;
    const out = confirmarCodigo(conta, req.body?.codigo);
    if (!out.ok) return res.status(out.status).json({ error: out.erro });
    await registrarAuditoria(repo.db, { adminContaId: conta, acao: "entrar_painel" });
    res.json({ token: await emitirTokenPainel(conta), validadeToken: PAINEL_TOKEN_VALIDADE });
  }));

  // ---- daqui para baixo: conta admin + token do painel
  r.use(...CONTA_ADMIN, exigirTokenPainel);

  // visão geral: online por zona e totais
  r.get("/visao", rota(async (_req, res) => {
    const contas = await repo.db.query<{ n: string }>("select count(*)::text as n from accounts");
    const personagens = await repo.db.query<{ n: string }>("select count(*)::text as n from characters");
    const zonas = jogadoresPorZona();
    res.json({
      online: zonas.reduce((s, z) => s + z.jogadores, 0),
      zonas,
      contas: Number(contas.rows[0]?.n ?? 0),
      personagens: Number(personagens.rows[0]?.n ?? 0),
      geradoEm: Date.now(),
    });
  }));

  // jogadores: busca por nome. O e-mail vai SEMPRE mascarado nesta lista.
  r.get("/jogadores", rota(async (req, res) => {
    const q = typeof req.query.q === "string" ? nameKey(req.query.q).slice(0, 40) : "";
    if (q.length < 2) return res.json({ itens: [], aviso: "Digite pelo menos 2 letras do nome." });
    const { rows } = await repo.db.query<{ id: string; account_id: string; name: string; class: CharClass; level: number; zone: number; email: string | null }>(
      `select c.id, c.account_id, c.name, c.class, c.level, c.zone, a.email
         from characters c join accounts a on a.id = c.account_id
        where c.name_key like '%' || $1 || '%' order by c.name limit 25`,
      [q],
    );
    res.json({
      itens: rows.map((c) => ({
        id: c.id,
        nome: c.name,
        classe: c.class,
        nivel: c.level,
        zona: c.zone,
        emailMascarado: mascararEmail(c.email),
        online: contaOnline(c.account_id),
      })),
    });
  }));

  // ficha completa (só leitura; as sanções têm rota própria)
  r.get("/jogadores/:id", rota(async (req, res) => {
    const id = texto(req.params.id);
    const { rows } = await repo.db.query<{
      id: string; account_id: string; name: string; class: CharClass; level: number; xp: number; zone: number; iron: number; obols: number;
      criado_em: string; email: string | null; conta_criada: string;
    }>(
      `select c.id, c.account_id, c.name, c.class, c.level, c.xp, c.zone, c.iron, c.obols,
              c.created_at::text as criado_em, a.email, a.created_at::text as conta_criada
         from characters c join accounts a on a.id = c.account_id where c.id::text = $1`,
      [id],
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: "Personagem não encontrado." });
    const inv = await repo.loadInventory(c.id, c.class);
    const nomeDoItem = (itemId: string) => ITEMS[itemId]?.name ?? itemId;
    const equipamento = Object.fromEntries(
      Object.entries(inv.equip).map(([slot, itemId]) => [slot, itemId ? nomeDoItem(itemId) : null]),
    );
    const poder = poderTotal(statsDoPersonagem(c.class, c.level, gearBonuses(inv.equip, c.class, inv.equipAf, inv.equipRf, inv.equipGm)));
    const logins = await repo.db.query<{ criado_em: string }>(
      "select criado_em::text as criado_em from eventos where conta_id = $1 and tipo = 'login' order by criado_em desc limit 5",
      [c.account_id],
    );
    const historico = (await listarAuditoria(repo.db, 100, c.account_id)).slice(0, 25);
    res.json({
      id: c.id,
      nome: c.name,
      classe: c.class,
      nivel: c.level,
      xp: c.xp,
      zona: c.zone,
      poder: Math.round(poder),
      criadoEm: c.criado_em,
      contaCriadaEm: c.conta_criada,
      emailMascarado: mascararEmail(c.email),
      temEmail: !!c.email,
      online: contaOnline(c.account_id),
      tostoes: inv.iron,
      obolos: inv.obols,
      inventario: inv.slots.flatMap((s, i) => (s ? [{ slot: i, item: nomeDoItem(s.id), qtd: s.qty }] : [])),
      equipamento,
      sancao: await estadoSancao(repo, c.account_id),
      logins: logins.rows.map((l) => l.criado_em),
      historico,
    });
  }));

  // revelar o e-mail completo: um por vez e sempre registrado na auditoria
  r.post("/jogadores/:id/revelar", rota(async (req, res) => {
    const id = texto(req.params.id);
    const { rows } = await repo.db.query<{ account_id: string; name: string; email: string | null }>(
      "select c.account_id, c.name, a.email from characters c join accounts a on a.id = c.account_id where c.id::text = $1", [id]);
    const c = rows[0];
    if (!c) return res.status(404).json({ error: "Personagem não encontrado." });
    if (!c.email) return res.status(404).json({ error: "Esta conta não tem e-mail cadastrado." });
    await registrarAuditoria(repo.db, { adminContaId: req.user!.id, acao: "revelar_email", alvoContaId: c.account_id, alvoPersonagemId: id, alvoNome: c.name });
    res.json({ email: c.email });
  }));

  // sanções: silenciar, dessilenciar, banir, desbanir, expulsar
  r.post("/jogadores/:id/sancao", rota(async (req, res) => {
    const acao = req.body?.acao;
    if (!(ACOES_SANCAO as readonly string[]).includes(acao)) return res.status(400).json({ error: "Ação de sanção inválida." });
    const { rows } = await repo.db.query<{ id: string; account_id: string; name: string }>(
      "select id, account_id, name from characters where id::text = $1", [texto(req.params.id)]);
    const alvo = rows[0];
    if (!alvo) return res.status(404).json({ error: "Personagem não encontrado." });
    const out = await aplicarSancao(repo, req.user!.id, alvo, {
      acao,
      minutos: req.body?.minutos,
      permanente: req.body?.permanente === true,
      motivo: req.body?.motivo,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.erro });
    res.json({ ok: true, resumo: out.resumo, antes: out.antes, depois: out.depois });
  }));

  // denúncias: abertas (padrão) ou resolvidas
  r.get("/denuncias", rota(async (req, res) => {
    const resolvidas = req.query.estado === "resolvidas";
    const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 50));
    const { rows } = await repo.db.query<{ id: string; criado_em: string; denunciado_nome: string; denunciado_personagem_id: string | null; motivo: string }>(
      `select id, criado_em::text as criado_em, denunciado_nome, denunciado_personagem_id, motivo
         from denuncias where resolvida = $1 order by criado_em desc limit $2`,
      [resolvidas, limite],
    );
    res.json({
      itens: rows.map((d) => ({ id: Number(d.id), criadoEm: d.criado_em, nome: d.denunciado_nome, personagemId: d.denunciado_personagem_id, motivo: d.motivo, resolvida: resolvidas })),
    });
  }));

  r.post("/denuncias/:id/resolver", rota(async (req, res) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: "Denúncia inválida." });
    const { rows } = await repo.db.query<{ denunciado_nome: string; denunciado_personagem_id: string | null }>(
      "update denuncias set resolvida = true where id = $1 and resolvida = false returning denunciado_nome, denunciado_personagem_id", [n]);
    if (!rows[0]) return res.status(404).json({ error: "Denúncia não encontrada ou já resolvida." });
    await registrarAuditoria(repo.db, {
      adminContaId: req.user!.id,
      acao: "resolver_denuncia",
      alvoPersonagemId: rows[0].denunciado_personagem_id,
      alvoNome: rows[0].denunciado_nome,
      detalhes: { denuncia: n },
    });
    res.json({ ok: true });
  }));

  // auditoria: as ações mais recentes
  r.get("/auditoria", rota(async (req, res) => {
    const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 100));
    res.json({ itens: await listarAuditoria(repo.db, limite) });
  }));

  return r;
}
