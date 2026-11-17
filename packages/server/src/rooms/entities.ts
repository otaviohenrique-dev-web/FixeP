import { Schema, MapSchema, type } from "@colyseus/schema";
import { SPAWN, WARRIOR, SKELETON } from "@frixep/shared";

export class Player extends Schema {
  @type("number") x = SPAWN.x;
  @type("number") y = SPAWN.y;
  @type("number") face = 0; // ângulo (rad) no espaço da grade
  @type("string") name = "";
  @type("number") hp = WARRIOR.maxHp;
  @type("number") maxHp = WARRIOR.maxHp;
  @type("boolean") dead = false;
  @type("boolean") buff = false; // Grito de guerra ativo
  @type("number") level = 1;
  @type("number") xp = 0;

  // --- só no servidor (não sincronizado) ---
  charId = ""; // linha em `characters`
  dirty = false; // progresso ainda não salvo
  tx = SPAWN.x;
  ty = SPAWN.y;
  cdUntil: Record<string, number> = {};
  dashVx = 0;
  dashVy = 0;
  dashLeft = 0;
  invulnUntil = 0;
  buffUntil = 0;
  deadUntil = 0;
}

export type EnemyState = "idle" | "chase" | "windup" | "recover" | "dead";

export class Enemy extends Schema {
  @type("string") kind = "skeleton";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") face = 0;
  @type("number") hp = SKELETON.maxHp;
  @type("number") maxHp = SKELETON.maxHp;
  @type("string") st: EnemyState = "idle";

  // --- só no servidor ---
  sx = 0; // ponto de origem (spawn)
  sy = 0;
  targetId = "";
  tauntId = "";
  tauntUntil = 0;
  windupEnd = 0;
  strikeX = 0;
  strikeY = 0;
  recoverEnd = 0;
  respawnAt = 0;
}

export class ZoneState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
}
