import { Router, type Request, type Response, type NextFunction } from "express";
import { PLAYABLE_CLASSES, START_ZONE, MAX_CHARACTERS_PER_ACCOUNT, type CharClass } from "@frixep/shared";
import { verifySession, type AuthUser } from "./auth.js";
import { registrarEvento } from "./telemetria.js";
import { Repo, validateName } from "./db/repo.js";
import { isAdmin } from "./moderacao.js";
import type { Balanceamento } from "./balanceamento.js";

declare module "express-serve-static-core" {
  interface Request { user?: AuthUser }
}

// limite simples por IP (memória): protege /me e /character de abuso.
// API_RATE_MULT só deve ser usado em testes automatizados (afrouxa o limite).
const RATE_MULT = Number(process.env.API_RATE_MULT ?? 1);
const hits = new Map<string, { n: number; reset: number }>();
function limit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    let h = hits.get(key);
    if (!h || now > h.reset) hits.set(key, (h = { n: 0, reset: now + windowMs }));
    if (++h.n > max * RATE_MULT) return res.status(429).json({ error: "Muitas tentativas. Aguarde um instante." });
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (now > h.reset) hits.delete(k);
}, 60_000).unref();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  try {
    req.user = await verifySession(h.startsWith("Bearer ") ? h.slice(7) : undefined);
    next();
  } catch {
    res.status(401).json({ error: "Não autorizado." });
  }
}

/**
 * PONTO DE TROCA DA AUTENTICAÇÃO DO PAINEL ADMIN. Hoje as rotas /api/admin/* usam requireAuth + isAdmin (moderacao.ts).
 * Quando a F1 do painel (acesso com 2FA) entrar na main, troque a lista ADMIN_ROTAS abaixo pelo middleware de sessão dela
 * (ex.: [limit(...), exigirSessaoPainel]); nenhuma rota de balanceamento precisa mudar.
 */
function exigirAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdmin(req.user?.id)) return res.status(403).json({ error: "Reservado a administradores." });
  next();
}
const ADMIN_ROTAS = [requireAuth, exigirAdmin] as const;

const shape = (c: { id: string; name: string; class: string; level: number; xp: number; zone?: number }) =>
  ({ id: c.id, name: c.name, class: c.class, level: c.level, xp: c.xp, zone: c.zone ?? START_ZONE });

export function apiRouter(repo: Repo, balance: Balanceamento): Router {
  const r = Router();

  // ---- balanceamento ao vivo (admin). Erros de valor/motivo voltam 400; a lista de erros vem do próprio módulo.
  const motivoDe = (b: any) => (typeof b?.motivo === "string" ? b.motivo : "");
  const responderResultado = (res: Response, out: { ok: boolean; erro?: string; status?: number }) => {
    if (out.ok) return res.json({ ok: true });
    res.status(out.status ?? 400).json({ error: out.erro });
  };
  r.get("/admin/balanceamento", limit(120, 60_000), ...ADMIN_ROTAS, (_req, res) => {
    res.json({ ajustes: balance.listar() });
  });
  r.put("/admin/balanceamento/:chave", limit(60, 60_000), ...ADMIN_ROTAS, async (req, res) => {
    try {
      if (typeof req.body?.valor !== "number") return res.status(400).json({ error: "Informe o valor (número inteiro)." });
      responderResultado(res, await balance.definir(req.params.chave, req.body.valor, motivoDe(req.body), req.user!.id));
    } catch (e) {
      console.error("[api] balanceamento:", (e as Error).message);
      res.status(500).json({ error: "Erro interno." });
    }
  });
  r.post("/admin/balanceamento/:chave/padrao", limit(60, 60_000), ...ADMIN_ROTAS, async (req, res) => {
    try {
      responderResultado(res, await balance.padrao(req.params.chave, motivoDe(req.body), req.user!.id));
    } catch (e) {
      console.error("[api] balanceamento/padrao:", (e as Error).message);
      res.status(500).json({ error: "Erro interno." });
    }
  });
  r.get("/admin/balanceamento/historico", limit(120, 60_000), ...ADMIN_ROTAS, async (req, res) => {
    try {
      const chave = typeof req.query.chave === "string" ? req.query.chave : undefined;
      res.json({ historico: await balance.historico(chave) });
    } catch (e) {
      console.error("[api] balanceamento/historico:", (e as Error).message);
      res.status(500).json({ error: "Erro interno." });
    }
  });
  r.post("/admin/balanceamento/desfazer/:id", limit(60, 60_000), ...ADMIN_ROTAS, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Histórico inválido." });
      responderResultado(res, await balance.desfazer(id, req.user!.id));
    } catch (e) {
      console.error("[api] balanceamento/desfazer:", (e as Error).message);
      res.status(500).json({ error: "Erro interno." });
    }
  });

  r.get("/me", limit(60, 60_000), requireAuth, async (req, res) => {
    try {
      // token de uma conta que não existe (ex.: emitido antes da F2): sessão inválida => volta ao login
      if (!(await repo.accountExists(req.user!.id))) return res.status(401).json({ error: "Sessão expirada." });
      const personagens = await repo.listCharacters(req.user!.id);
      res.json({ account: { name: req.user!.name }, characters: personagens.map(shape), max: MAX_CHARACTERS_PER_ACCOUNT });
    } catch (e) {
      console.error("[api] /me:", (e as Error).message);
      res.status(500).json({ error: "Erro interno." });
    }
  });

  r.post("/character", limit(10, 60_000), requireAuth, async (req, res) => {
    const v = validateName(req.body?.name);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const cls = req.body?.class as CharClass;
    if (!PLAYABLE_CLASSES.includes(cls)) return res.status(400).json({ error: "Essa classe ainda não está disponível." });
    try {
      if (!(await repo.accountExists(req.user!.id))) return res.status(401).json({ error: "Sessão expirada." });
      const out = await repo.createCharacter(req.user!.id, v.name, cls);
      if (!out.ok) {
        return res.status(409).json({ error: out.error === "name_taken" ? "Esse nome já está em uso." : `Sua conta já tem o máximo de ${MAX_CHARACTERS_PER_ACCOUNT} personagens.` });
      }
      void registrarEvento(repo.db, "criacao_personagem", { contaId: req.user!.id, personagemId: out.character.id, dados: { classe: cls } });
      res.status(201).json({ character: shape(out.character) });
    } catch (e) {
      console.error("[api] /character:", (e as Error).message);
      res.status(500).json({ error: "Erro interno." });
    }
  });

  return r;
}
