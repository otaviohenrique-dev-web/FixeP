import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ZoneRoom } from "./rooms/ZoneRoom.js";
import { authRouter } from "./auth.js";
import { apiRouter } from "./api.js";
import { openDb } from "./db/index.js";
import { Repo } from "./db/repo.js";
import { Balanceamento } from "./balanceamento.js";
import { origemPermitida } from "./origens.js";
import { avisarConfiguracaoPainel } from "./painel/email.js";
import { ZONE_IDS, zoneRoomName } from "@frixep/shared";

const port = Number(process.env.PORT ?? 2567);
const permitida = (o: string | undefined) => origemPermitida(o);

const db = await openDb();
const repo = new Repo(db);
const balance = new Balanceamento(db);
await balance.carregar(); // ajustes salvos valem desde o primeiro jogador
avisarConfiguracaoPainel();

const app = express();
app.set("trust proxy", 1); // atrás do proxy (Render): IP real nos limites de taxa
// /health fica ANTES do CORS: sempre liberado, qualquer Origin
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (permitida(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origem não permitida por CORS: ${origin}`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use("/auth", authRouter(repo));
app.use("/api", apiRouter(repo, balance));

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    maxPayload: 2048 /* mensagens legítimas têm poucos bytes */,
    // WebSocket: Origin de fora da lista é recusado (sem Origin, como nos testes, passa)
    verifyClient: (info: { origin?: string }, cb: (ok: boolean, code?: number, msg?: string) => void) =>
      permitida(info.origin) ? cb(true) : cb(false, 403, "Origem não permitida"),
  }),
});
for (const id of ZONE_IDS) gameServer.define(zoneRoomName(id), ZoneRoom, { repo, balance }); // uma sala por zona ("zone", "zone2", "zone3")
await gameServer.listen(port);
// Porteiro HTTP na frente de TUDO (Express e matchmaking do Colyseus): Origin de fora da lista leva 403. /health é sempre liberado.
const ouvintes = httpServer.listeners("request").slice(0) as http.RequestListener[];
httpServer.removeAllListeners("request");
httpServer.on("request", (req, res) => {
  const origin = req.headers.origin;
  if (req.url?.split("?")[0] !== "/health" && !permitida(origin)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origem não permitida" }));
    return;
  }
  for (const l of ouvintes) l.call(httpServer, req, res);
});
console.log(`[frixep] servidor em http://localhost:${port} (ws no mesmo porto)`);
