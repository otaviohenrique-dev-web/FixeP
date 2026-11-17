import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ZoneRoom } from "./rooms/ZoneRoom.js";
import { authRouter } from "./auth.js";

const port = Number(process.env.PORT ?? 2567);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: "10kb" }));
app.use("/auth", authRouter());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, maxPayload: 2048 }) /* mensagens legítimas têm poucos bytes */ });
gameServer.define("zone", ZoneRoom);
await gameServer.listen(port);
console.log(`[frixep] servidor em http://localhost:${port} (ws no mesmo porto)`);
