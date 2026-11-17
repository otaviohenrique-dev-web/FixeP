import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ZoneRoom } from "./rooms/ZoneRoom.js";

const port = Number(process.env.PORT ?? 2567);
const gameServer = new Server({ transport: new WebSocketTransport() });
gameServer.define("zone", ZoneRoom);
await gameServer.listen(port);
console.log(`[frixep] servidor em ws://localhost:${port}`);
