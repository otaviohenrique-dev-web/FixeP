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
import { ZONE_IDS, zoneRoomName } from "@frixep/shared";

const port = Number(process.env.PORT ?? 2567);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";

const db = await openDb();
const repo = new Repo(db);

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h === "frixep.com" || h.endsWith(".frixep.com")) return true;
    if (h.endsWith(".onrender.com")) return true;
    if (clientUrl && origin === clientUrl) return true;
  } catch {}
  return false;
};

const app = express();
app.set("trust proxy", 1); // atrás do proxy (Render): IP real nos limites de taxa
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
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
app.use("/api", apiRouter(repo));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 2048 }) /* mensagens legítimas têm poucos bytes */,
});
for (const id of ZONE_IDS) gameServer.define(zoneRoomName(id), ZoneRoom, { repo }); // uma sala por zona ("zone", "zone2", "zone3")
await gameServer.listen(port);
console.log(`[frixep] servidor em http://localhost:${port} (ws no mesmo porto)`);
