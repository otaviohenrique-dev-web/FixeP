import { Router, type Request, type Response, type NextFunction } from "express";
import { PLAYABLE_CLASSES, type CharClass } from "@frixep/shared";
import { verifySession, type AuthUser } from "./auth.js";
import { Repo, validateName } from "./db/repo.js";

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

const shape = (c: { name: string; class: string; level: number; xp: number } | null) =>
  c ? { name: c.name, class: c.class, level: c.level, xp: c.xp } : null;

export function apiRouter(repo: Repo): Router {
  const r = Router();

  r.get("/me", limit(60, 60_000), requireAuth, async (req, res) => {
    try {
      // token de uma conta que não existe (ex.: emitido antes da F2): sessão inválida => volta ao login
      if (!(await repo.accountExists(req.user!.id))) return res.status(401).json({ error: "Sessão expirada." });
      res.json({ account: { name: req.user!.name }, character: shape(await repo.getCharacter(req.user!.id)) });
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
        return res.status(409).json({ error: out.error === "name_taken" ? "Esse nome já está em uso." : "Você já tem um personagem." });
      }
      res.status(201).json({ character: shape(out.character) });
    } catch (e) {
      console.error("[api] /character:", (e as Error).message);
      res.status(500).json({ error: "Erro interno." });
    }
  });

  return r;
}
