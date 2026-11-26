import { randomUUID, randomBytes } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { registrarEvento } from "./telemetria.js";
import { marcarContaTesteAdmin } from "./moderacao.js";
import { SignJWT, jwtVerify } from "jose";
import type { Repo } from "./db/repo.js";

const isProd = process.env.NODE_ENV === "production";
if (isProd && !process.env.JWT_SECRET) throw new Error("JWT_SECRET obrigatório em produção");
export const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-only-secret-change-me-32-chars!!");

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:2567"; // base pública da API
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

export interface AuthUser {
  id: string;
  name: string;
}

/** `Authorization: Bearer` obrigatório; sem token válido responde 401. Vale para a API do jogador e para o painel. */
export async function exigirSessao(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  try {
    req.user = await verifySession(h.startsWith("Bearer ") ? h.slice(7) : undefined);
    next();
  } catch {
    res.status(401).json({ error: "Não autorizado." });
  }
}

export async function signSession(u: AuthUser): Promise<string> {
  return new SignJWT({ name: u.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: unknown): Promise<AuthUser> {
  if (typeof token !== "string") throw new Error("token ausente");
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  if (payload.aud !== undefined) throw new Error("token de outro uso (ex.: painel)"); // token do painel não serve como sessão do jogo
  return { id: String(payload.sub), name: String(payload.name ?? "Portador") };
}

interface Provider {
  authUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
  profile: (j: any) => { id: string; name: string; email: string | null };
}

const providers: Record<string, Provider> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid profile email",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    profile: (j) => ({ id: j.sub, name: j.given_name ?? j.name ?? "Portador", email: typeof j.email === "string" && j.email_verified !== false ? j.email : null }),
  },
  discord: {
    authUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userUrl: "https://discord.com/api/users/@me",
    scope: "identify email",
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    profile: (j) => ({ id: j.id, name: j.global_name ?? j.username ?? "Portador", email: typeof j.email === "string" && j.verified !== false ? j.email : null }),
  },
};

const redirectUri = (p: string) => `${SERVER_URL}/auth/${p}/callback`;

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === name)?.[1];
}

function backToClient(token?: string, error?: string) {
  const frag = token ? `token=${encodeURIComponent(token)}` : `error=${encodeURIComponent(error ?? "falha")}`;
  return `${CLIENT_URL}/#${frag}`; // fragmento: não vai para logs de servidor nem Referer
}

export function authRouter(repo: Repo): Router {
  const r = Router();

  r.get("/providers", (_req, res) => {
    res.json({
      google: !!providers.google.clientId,
      discord: !!providers.discord.clientId,
      guest: !isProd || process.env.ALLOW_GUEST === "1",
    });
  });

  r.get("/:provider", async (req, res) => {
    const p = providers[req.params.provider];
    if (!p?.clientId) return res.status(404).send("provedor indisponível");
    const nonce = randomBytes(16).toString("hex");
    const state = await new SignJWT({ nonce }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(secret);
    res.cookie("oauth_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 600_000 });
    const q = new URLSearchParams({
      client_id: p.clientId,
      redirect_uri: redirectUri(req.params.provider),
      response_type: "code",
      scope: p.scope,
      state,
    });
    res.redirect(`${p.authUrl}?${q}`);
  });

  r.get("/:provider/callback", async (req, res) => {
    const name = req.params.provider;
    const p = providers[name];
    try {
      if (!p?.clientId || !p.clientSecret) throw new Error("provedor indisponível");
      const { code, state } = req.query;
      if (typeof code !== "string" || typeof state !== "string") throw new Error("parâmetros inválidos");
      const { payload } = await jwtVerify(state, secret, { algorithms: ["HS256"] });
      if (payload.nonce !== readCookie(req.headers.cookie, "oauth_nonce")) throw new Error("state inválido");
      res.clearCookie("oauth_nonce");

      const tokRes = await fetch(p.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: p.clientId,
          client_secret: p.clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri(name),
        }),
      });
      const tok: any = await tokRes.json();
      if (!tok.access_token) {
        throw new Error(`troca de código falhou: ${tok.error ?? ""} ${tok.error_description ?? ""}`.trim());
      }

      const profRes = await fetch(p.userUrl, { headers: { Authorization: `Bearer ${tok.access_token}` } });
      const prof = p.profile(await profRes.json());
      const acct = await repo.upsertAccount(name, String(prof.id), String(prof.name).slice(0, 20), prof.email);
      void registrarEvento(repo.db, "login", { contaId: acct.id, dados: { provedor: name } });
      res.redirect(backToClient(await signSession({ id: acct.id, name: acct.name })));
    } catch (e) {
      console.warn("[auth] falha OAuth:", (e as Error).message);
      res.redirect(backToClient(undefined, "login_falhou"));
    }
  });

  // Conta convidada: só em dev (ou ALLOW_GUEST=1).
  r.post("/guest", async (_req, res) => {
    if (isProd && process.env.ALLOW_GUEST !== "1") return res.status(403).end();
    try {
      // convidado não tem e-mail; só nos testes automatizados (fora de produção) a conta ganha um, para o código do painel
      const emailTeste = !isProd && process.env.ADMIN_TEST_FIRST_GUEST === "1" ? "teste-painel@example.com" : null;
      const acct = await repo.upsertAccount("guest", randomUUID(), `Convidado-${randomBytes(2).toString("hex")}`, emailTeste);
      marcarContaTesteAdmin(acct.id); // só com ADMIN_TEST_FIRST_GUEST=1 (testes automatizados)
      void registrarEvento(repo.db, "login", { contaId: acct.id, dados: { provedor: "guest" } });
      res.json({ token: await signSession({ id: acct.id, name: acct.name }) });
    } catch (e) {
      console.error("[auth] guest:", (e as Error).message);
      res.status(500).end();
    }
  });

  return r;
}
