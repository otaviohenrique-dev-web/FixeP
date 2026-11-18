import { Schema, MapSchema, type } from "@colyseus/schema";
import { SPAWN, CLASS_DEFS, SKELETON } from "@frixep/shared";
import { emptyInventory, type Inventory } from "../game/inventory.js";

export class Player extends Schema {
  @type("number") x = SPAWN.x;
  @type("number") y = SPAWN.y;
  @type("number") face = 0; // ângulo (rad) no espaço da grade
  @type("string") name = "";
  @type("number") hp = CLASS_DEFS.warrior.maxHp;
  @type("number") maxHp = CLASS_DEFS.warrior.maxHp;
  @type("boolean") dead = false;
  @type("string") cls = "warrior";
  @type("boolean") buff = false; // Grito de guerra ativo
  @type("boolean") ember = false; // Brasa do Clérigo ativa
  @type("number") mana = 0; // recurso da classe (inteiro, para a HUD)
  @type("number") maxMana = 0;
  @type("number") level = 1;
  @type("number") xp = 0;
  @type("boolean") pvp = false; // modo PvP ativo (só entre quem também está nele)
  @type("number") pvpChan = 0; // canalização: 0 nenhuma, 1 entrando, 2 saindo (o cliente conta os segundos)

  // --- só no servidor (não sincronizado) ---
  charId = ""; // linha em `characters`
  dirty = false; // progresso ainda não salvo
  invDirty = false; // inventário ainda não salvo
  inv: Inventory = emptyInventory();
  potionCdUntil = 0;
  manaF = 0; // valor exato (com fração); `mana` é o arredondado que vai para o cliente
  emberUntil = 0;
  emberPct = 0;
  saveChain: Promise<void> = Promise.resolve(); // salvamentos do mesmo jogador rodam em fila (dado velho não sobrescreve novo)
  tx = SPAWN.x;
  ty = SPAWN.y;
  cdUntil: Record<string, number> = {};
  dashVx = 0;
  dashVy = 0;
  dashLeft = 0;
  invulnUntil = 0;
  buffUntil = 0;
  deadUntil = 0;
  pvpChanUntil = 0; // fim da canalização (relógio da simulação)
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
  @type("number") level = 1;

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
