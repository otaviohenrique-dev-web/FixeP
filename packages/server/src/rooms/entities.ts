import { Schema, MapSchema, type } from "@colyseus/schema";
import { SPAWN, CLASS_DEFS, SKELETON, emptyBonuses, type GearBonuses } from "@frixep/shared";
import { emptyInventory, type Inventory } from "../game/inventory.js";
import type { Vault } from "../game/vault.js";
import type { QuestMap } from "../game/quests.js";

export class Player extends Schema {
  atGate = false; // na cidade: já está dentro do raio do portão (o mapa-mundo abre uma vez por entrada)
  @type("number") x = SPAWN.x;
  @type("number") y = SPAWN.y;
  @type("number") face = 0; // ângulo (rad) no espaço da grade
  @type("string") name = "";
  @type("number") hp = CLASS_DEFS.warrior.maxHp;
  @type("number") maxHp = CLASS_DEFS.warrior.maxHp;
  @type("boolean") dead = false;
  @type("string") cls = "warrior";
  @type("boolean") shield = false; // bolha de proteção da chegada (imune a dano): os outros jogadores veem a bolha
  @type("boolean") buff = false; // Escudo Refletor ativo (mitigação)
  @type("boolean") ember = false; // Brasa do Clérigo ativa
  @type("boolean") reflect = false; // Escudo Refletor do Guerreiro ativo
  @type("number") healStacks = 0; // acúmulos de Cura Focada NESTE jogador (0 a 3): a UI mostra o número
  @type("number") healStackS = 0; // segundos restantes dos acúmulos (0 = sem acúmulo); o cliente conta daí
  @type("number") qMode = 0; // Clérigo: 0 = Q cura em área, 1 = Q cura focada
  @type("number") autoPotAt = 0; // auto-poção: bebe sozinho com a vida até este % (0 = desligada; passo 5, máximo 90)
  @type("number") mana = 0; // recurso da classe (inteiro, para a HUD)
  @type("number") maxMana = 0;
  @type("number") level = 1;
  @type("number") xp = 0;
  @type("boolean") pvp = false; // modo PvP ativo (só entre quem também está nele)
  @type("number") pvpChan = 0; // canalização: 0 nenhuma, 1 entrando, 2 saindo (o cliente conta os segundos)
  @type("boolean") stunned = false; // atordoado (PvP): não age nem anda (o cliente mostra estrelas)
  @type("boolean") rooted = false; // enraizado (PvP): não anda (o cliente mostra correntes)
  @type("string") party = ""; // id do grupo ("" = sem grupo); o cliente marca a placa de quem é do seu grupo
  @type("string") weaponRarity = ""; // raridade da arma equipada ("" = sem arma): o cliente desenha o brilho público no personagem

  // --- só no servidor (não sincronizado) ---
  charId = ""; // linha em `characters`
  dirty = false; // progresso ainda não salvo
  invDirty = false; // inventário ainda não salvo
  vault: Vault | null = null; // baú pessoal (carregado do banco na primeira abertura)
  vaultDirty = false; // baú ainda não salvo
  vaultBusy = false; // operação do baú em andamento
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
  /** comando guardado por um instante (durante esquiva/investida ou a poucos ms do fim da recarga): sai assim que puder */
  queued: { a: string; ax: number; ay: number; until: number } | null = null;
  hasteUntil = 0; // bônus temporário de velocidade de ataque (Chuva)
  hastePct = 0;
  atkSpeed = 1; // velocidade de ataque (1 = normal): o intervalo do ataque básico é cd / atkSpeed (itens e buffs futuros)
  dashVx = 0;
  dashVy = 0;
  dashLeft = 0;
  invulnUntil = 0;
  shieldPending = false; // bolha já ativa, mas ainda sem contar: o cliente está carregando (começa em Msg.Ready)
  shieldUntil = 0; // fim da bolha (relógio da simulação); com shieldPending vale como o prazo máximo da espera
  buffUntil = 0;
  buffRed = 0; // redução de dano do buff ativo (Escudo Refletor)
  reflectUntil = 0;
  reflectPct = 0; // fração do dano dos inimigos que volta a eles
  hurtAt = -1e9; // último dano RECEBIDO (o PvP só canaliza depois de PVP_NO_DAMAGE_S sem apanhar)
  healStackUntil = 0; // fim dos acúmulos de Cura Focada (relógio da simulação); depois zera
  healStackPct = 0; // +% por acúmulo nas curas do Clérigo neste jogador (vem do efeito "stacks")
  guardUntil = 0; // escudo leve da cura (Cura em Área / Luz Divina) até este instante: só para a UI (a mitigação usa buffUntil)
  provokeUntil = 0; // Provocação do Guerreiro (Escudo Refletor) até este instante: só para a UI de buffs
  buffSig = ""; // assinatura da lista de buffs já enviada ao dono (muda = manda já)
  buffSentAt = -1e9; // último envio da lista de buffs (com buffs ativos, manda de 1 em 1 s para o tempo ficar certo)
  deadUntil = 0;
  marketBusy = false; // uma operação do mercado está gravando: a mochila não muda por outros caminhos até acabar
  trading = false; // numa troca: a mochila fica travada (nada se move) até fechar a janela
  dropAt = 0; // último item solto no chão (limite de frequência)
  traveling = false; // travessia aprovada: o jogador não age nem é alvo até sair da sala
  pvpChanUntil = 0; // fim da canalização (relógio da simulação)
  stunUntil = 0; // atordoado até este instante (Investida, Chuva, Compressor de Ar...)
  rootUntil = 0; // enraizado até este instante (Correntes)
  pullUntil = 0; // puxado pelo Compressor de Ar até este instante
  pullX = 0; // ponto para onde é puxado
  pullY = 0;
  travelNoteAt = -1e9; // último aviso "em combate" ao tentar atravessar (para não repetir a cada tick)
  combatAt = -1e9; // último instante em que causou ou recebeu dano (a regeneração de vida espera PLAYER_REGEN_DELAY_S)
  regenAcc = 0; // fração de vida regenerada ainda não aplicada (hp é inteiro)
  quests: QuestMap = new Map(); // quests do personagem (C1.1): carregadas do banco ao entrar
  questDirty = new Set<string>(); // quests alteradas ainda não gravadas

}

export type EnemyState = "idle" | "chase" | "windup" | "recover" | "evade" | "dead";

export class Enemy extends Schema {
  @type("string") kind = "skeleton";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") face = 0;
  @type("number") hp = SKELETON.maxHp;
  @type("number") maxHp = SKELETON.maxHp;
  @type("string") st: EnemyState = "idle";
  @type("number") level = 1;
  @type("boolean") stunned = false; // atordoado: não age (o cliente mostra estrelas)
  @type("boolean") rooted = false; // enraizado: não anda (o cliente mostra raízes/correntes)
  @type("boolean") shredded = false; // armadura quebrada: recebe mais dano (o cliente mostra um escudo rachado)
  @type("boolean") slowed = false; // lento (o cliente mostra um floco de gelo)
  @type("boolean") burning = false; // queimadura ativa (Mago): dano ao longo do tempo (o cliente mostra chamas)

  // --- só no servidor ---
  burnUntil = 0; // queimadura: dano por segundo até burnUntil (renova; não acumula)
  burnDmg = 0;
  burnBy = ""; // quem queimou (recebe o crédito do abate)
  nextBurn = 0; // próximo tick de queimadura
  stunUntil = 0;
  rootUntil = 0;
  shredUntil = 0; // quebra de armadura: recebe +shredPct de dano até shredUntil
  shredPct = 0;
  slowUntil = 0; // lentidão: anda -slowPct até slowUntil
  slowPct = 0;
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
  contrib = new Map<string, number>(); // sessão -> dano causado (define quem é elegível a XP e loot)
  lastHurt = -1e9; // último dano recebido: o inimigo só regenera depois de ENEMY_REGEN.delayS sem apanhar
  noTargetSince = -1; // chefe em luta: desde quando não há nenhum alvo vivo (-1 = há alvo)
  fightStart = 0; // chefe: início da luta (fúria por tempo); 0 = fora de combate
  nextPulse = 0; // chefe: próximo pulso sombrio
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
