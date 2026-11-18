import { Schema, MapSchema, type } from "@colyseus/schema";
import { SPAWN, CLASS_DEFS, SKELETON, emptyBonuses, type GearBonuses } from "@frixep/shared";
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
  @type("string") party = ""; // id do grupo ("" = sem grupo); o cliente marca a placa de quem é do seu grupo

  // --- só no servidor (não sincronizado) ---
  charId = ""; // linha em `characters`
  dirty = false; // progresso ainda não salvo
  invDirty = false; // inventário ainda não salvo
  inv: Inventory = emptyInventory();
  potionCdUntil = 0;
  gear: GearBonuses = emptyBonuses(); // bônus e kit do equipamento (recalculado ao equipar, subir de nível etc.)
  fullNoticeAt = 0; // aviso de "mochila cheia" com intervalo
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
  trading = false; // numa troca: a mochila fica travada (nada se move) até fechar a janela
  dropAt = 0; // último item solto no chão (limite de frequência)
  traveling = false; // travessia aprovada: o jogador não age nem é alvo até sair da sala
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
  pullUntil = 0; // sendo puxado (Compressor de Ar) até este instante
  pullX = 0;
  pullY = 0;
  windupEnd = 0;
  strikeX = 0;
  strikeY = 0;
  recoverEnd = 0;
  respawnAt = 0;
  nextSlam = 0; // chefe: próxima pancada em área
  slam = false; // o golpe em preparo é a pancada em área
  contrib = new Set<string>(); // sessões que feriram (o baú do chefe é de quem lutou)
}

/** Item no chão: visível a todos; só o dono (e o grupo dele) pega até `lockS` esgotar, depois qualquer um. */
export class GroundItem extends Schema {
  @type("string") itemId = "";
  @type("number") qty = 1;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") owner = ""; // sessão do dono (quem abateu)
  @type("string") party = ""; // grupo do dono
  @type("number") lockS = 0; // segundos de reserva restantes NO MOMENTO em que o item apareceu (o cliente conta daí)
  // --- só no servidor ---
  unlockAt = 0;
  expireAt = 0;
  noAutoSid = ""; // quem soltou o item não o pega sozinho até noAutoUntil (senão voltaria na hora); o pedido explícito de pegar vale
  noAutoUntil = 0;
}

export class ZoneState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
  @type({ map: GroundItem }) items = new MapSchema<GroundItem>();
  @type("number") zoneId = 1;
}
