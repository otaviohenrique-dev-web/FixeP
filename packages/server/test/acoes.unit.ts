// Refatoração das habilidades como dados (C2.1): prova que resolveAction devolve EXATAMENTE os valores de antes
// para toda ação de toda classe, e que um modificador de teste altera só o campo esperado.
// SNAPSHOT abaixo = CLASS_DEFS (actions e skill1Alt) do código ANTES da refatoração (commit 18fb8ca).
// Não edite para fazer passar: se algum valor mudar, é balanceamento, e isso não é deste card.
// REBALANCE DO GUERREIRO, CLÉRIGO E MAGO (design do dono): os blocos "warrior", "cleric" e "mage" foram REGERADOS
// com resolveAction depois desse rebalance (novos efeitos: cura, acúmulos, queimadura, escudo, mana). O Arqueiro
// segue exatamente como estava na C2.1, e é ele que continua provando que a refatoração não mudou nada.
// Uso (em packages/server): npx tsx test/acoes.unit.ts
import { CLASS_DEFS, resolveAction, classAction, type ActionDef, type ActionId, type ActionModifier, type CharClass } from "@frixep/shared";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

const SNAPSHOT: Record<CharClass, { actions: Record<ActionId, ActionDef>; skill1Alt: ActionDef | null }> = {
 "warrior": {
  "actions": {
   "attack": {
    "kind": "melee",
    "name": "Golpe",
    "key": "ESPAÇO",
    "cd": 0.55,
    "offset": 1,
    "radius": 1.25,
    "dmg": 10
   },
   "skill1": {
    "kind": "dashHit",
    "name": "Investida",
    "key": "Q",
    "cd": 7,
    "cost": 25,
    "dash": 4.5,
    "dashTime": 0.25,
    "radius": 1.2,
    "icon": "charge",
    "dmg": 10,
    "stunS": 1.2,
    "selfHeal": 8
   },
   "skill2": {
    "kind": "rain",
    "name": "Correntes",
    "key": "W",
    "cd": 10,
    "cost": 30,
    "radius": 2.8,
    "placeRange": 6,
    "delayS": 0.45,
    "fx": "chains",
    "icon": "chains",
    "dmg": 10,
    "rootS": 3.5,
    "slowPct": 30,
    "slowS": 3
   },
   "skill3": {
    "kind": "reflectBuff",
    "name": "Escudo Refletor",
    "key": "E",
    "cd": 14,
    "cost": 35,
    "buffS": 5,
    "reduction": 0.5,
    "reflect": 0.75,
    "tauntRadius": 7,
    "tauntS": 4,
    "icon": "shield"
   },
   "ultimate": {
    "kind": "rain",
    "name": "Queda do Colosso",
    "key": "R",
    "cd": 40,
    "cost": 80,
    "radius": 4.2,
    "placeRange": 6,
    "delayS": 1.5,
    "fx": "colossus",
    "icon": "hammer",
    "dmg": 40,
    "stunS": 1.8
   },
   "dodge": {
    "kind": "dodge",
    "name": "Esquiva",
    "key": "SHIFT",
    "cd": 1.4,
    "dash": 3,
    "dashTime": 0.25,
    "invulnS": 0.3
   }
  },
  "skill1Alt": null
 },
 "archer": {
  "actions": {
   "attack": {
    "kind": "projectile",
    "name": "Flecha",
    "key": "ESPAÇO",
    "cd": 0.5,
    "dmg": 9,
    "speed": 15,
    "range": 9,
    "radius": 0.35
   },
   "skill1": {
    "kind": "projectile",
    "name": "Perfurar",
    "key": "Q",
    "cd": 4,
    "cost": 20,
    "dmg": 15,
    "speed": 20,
    "range": 12,
    "radius": 0.5,
    "pierce": true,
    "shredPct": 20,
    "shredS": 6
   },
   "skill2": {
    "kind": "trap",
    "name": "Cilada",
    "key": "W",
    "cd": 8,
    "cost": 25,
    "dmg": 10,
    "radius": 1.6,
    "placeRange": 6,
    "armS": 0.6,
    "lifeS": 20,
    "maxActive": 3,
    "slowPct": 50,
    "slowS": 5
   },
   "skill3": {
    "kind": "rain",
    "name": "Chuva",
    "key": "E",
    "cd": 10,
    "cost": 35,
    "dmg": 17,
    "radius": 2.4,
    "placeRange": 8,
    "delayS": 0.8,
    "fx": "arrows",
    "hasteAtkPct": 60,
    "hasteS": 5
   },
   "ultimate": {
    "kind": "rain",
    "name": "Salva Final",
    "key": "R",
    "cd": 40,
    "cost": 80,
    "dmg": 26,
    "radius": 3.6,
    "placeRange": 9,
    "delayS": 1,
    "fx": "arrows"
   },
   "dodge": {
    "kind": "dodge",
    "name": "Esquiva",
    "key": "SHIFT",
    "cd": 1.6,
    "dash": 5,
    "dashTime": 0.25,
    "invulnS": 0.3
   }
  },
  "skill1Alt": null
 },
 "cleric": {
  "actions": {
   "attack": {
    "kind": "projectile",
    "name": "Raio",
    "key": "ESPAÇO",
    "cd": 0.7,
    "cost": 4,
    "speed": 12,
    "range": 8,
    "radius": 0.4,
    "dmg": 8
   },
   "skill1": {
    "kind": "healAoe",
    "name": "Cura em Área",
    "key": "Q",
    "cd": 5,
    "cost": 26,
    "radius": 5,
    "icon": "healAoe",
    "heal": 26,
    "manaGain": 8,
    "guardPct": 15,
    "guardS": 3
   },
   "skill2": {
    "kind": "pull",
    "name": "Compressor de Ar",
    "key": "W",
    "cd": 12,
    "cost": 30,
    "radius": 4.5,
    "placeRange": 6,
    "pullS": 0.45,
    "stunS": 1.2
   },
   "skill3": {
    "kind": "rain",
    "name": "Julgamento",
    "key": "E",
    "cd": 7,
    "cost": 30,
    "radius": 3,
    "placeRange": 7,
    "delayS": 0.6,
    "fx": "holy",
    "dmg": 26
   },
   "ultimate": {
    "kind": "healAoe",
    "name": "Luz Divina",
    "key": "R",
    "cd": 45,
    "cost": 90,
    "radius": 6,
    "icon": "healAoe",
    "heal": 80,
    "guardPct": 25,
    "guardS": 4,
    "cleanse": true
   },
   "dodge": {
    "kind": "dodge",
    "name": "Esquiva",
    "key": "SHIFT",
    "cd": 1.4,
    "dash": 3,
    "dashTime": 0.25,
    "invulnS": 0.3
   }
  },
  "skill1Alt": {
   "kind": "healFocus",
   "name": "Cura Focada",
   "key": "Q",
   "cd": 4,
   "cost": 30,
   "range": 9,
   "icon": "healFocus",
   "heal": 30,
   "stackMax": 3,
   "stackPct": 10,
   "stackS": 8
  }
 },
 "mage": {
  "actions": {
   "attack": {
    "kind": "projectile",
    "name": "Dardo Arcano",
    "key": "ESPAÇO",
    "cd": 0.8,
    "cost": 4,
    "speed": 13,
    "range": 9,
    "radius": 0.4,
    "dmg": 13
   },
   "skill1": {
    "kind": "blast",
    "name": "Bola de Fogo",
    "key": "Q",
    "cd": 5,
    "cost": 30,
    "speed": 11,
    "range": 10,
    "radius": 0.45,
    "blast": 2.3,
    "dmg": 18,
    "burnPct": 25,
    "burnS": 4
   },
   "skill2": {
    "kind": "rain",
    "name": "Relâmpago",
    "key": "W",
    "cd": 7,
    "cost": 28,
    "radius": 1.7,
    "placeRange": 9,
    "delayS": 0.35,
    "fx": "lightning",
    "dmg": 20,
    "stunS": 0.8
   },
   "skill3": {
    "kind": "rain",
    "name": "Chuva de Fogo",
    "key": "E",
    "cd": 11,
    "cost": 45,
    "radius": 3.1,
    "placeRange": 8,
    "delayS": 0.9,
    "fx": "firerain",
    "dmg": 30,
    "burnPct": 30,
    "burnS": 4
   },
   "ultimate": {
    "kind": "rain",
    "name": "Meteoro",
    "key": "R",
    "cd": 45,
    "cost": 100,
    "radius": 4.2,
    "placeRange": 9,
    "delayS": 1.5,
    "fx": "meteor",
    "dmg": 50,
    "rootS": 2,
    "burnPct": 30,
    "burnS": 5
   },
   "dodge": {
    "kind": "dodge",
    "name": "Esquiva",
    "key": "SHIFT",
    "cd": 1.5,
    "dash": 4,
    "dashTime": 0.25,
    "invulnS": 0.3
   }
  },
  "skill1Alt": null
 }
};

const CLASSES: CharClass[] = ["warrior", "archer", "cleric", "mage"];
const SLOTS: ActionId[] = ["attack", "skill1", "skill2", "skill3", "ultimate", "dodge"];
/** Compara campo a campo (um campo ausente conta como undefined). */
const same = (a: ActionDef, b: ActionDef) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a as any)[k] === (b as any)[k]);
};

// 1) toda ação de toda classe, sem modificadores, igual ao snapshot de antes
let total = 0;
let equal = 0;
const diffs: string[] = [];
for (const c of CLASSES) {
  for (const s of SLOTS) {
    total++;
    if (same(resolveAction(c, s), SNAPSHOT[c].actions[s])) equal++;
    else diffs.push(`${c}.${s}`);
  }
  const alt = SNAPSHOT[c].skill1Alt;
  if (alt) {
    total++;
    if (same(resolveAction(c, "skill1Alt"), alt)) equal++;
    else diffs.push(`${c}.skill1Alt`);
  }
}
check(`todas as ações (${total}) iguais ao snapshot de antes`, diffs.length === 0, diffs.join(", ") || `${equal}/${total}`);

// 2) CLASS_DEFS e classAction (o que servidor e cliente usam) dão o mesmo que resolveAction
const viaDefs = CLASSES.every((c) => SLOTS.every((s) => same(CLASS_DEFS[c].actions[s], resolveAction(c, s))));
const viaClassAction = CLASSES.every((c) => SLOTS.every((s) => same(classAction(c, s), resolveAction(c, s))));
check("CLASS_DEFS e classAction batem com resolveAction", viaDefs && viaClassAction);
check("Clérigo: Q com qMode 1 é a Cura Focada; com qMode 0 é a Cura em Área",
  same(classAction("cleric", "skill1", 1), SNAPSHOT.cleric.skill1Alt!) && same(classAction("cleric", "skill1", 0), SNAPSHOT.cleric.actions.skill1));

// 3) modificador de teste: só o campo esperado muda
const base = resolveAction("archer", "skill1");
const mod: ActionModifier = { id: "teste-dano", slot: "skill1", add: { dmg: 5 } };
const withMod = resolveAction("archer", "skill1", [mod]);
const changed = Object.keys({ ...base, ...withMod }).filter((k) => (base as any)[k] !== (withMod as any)[k]);
check("modificador de +5 de dano muda só o dano do Perfurar", changed.length === 1 && changed[0] === "dmg" && withMod.dmg === base.dmg! + 5, changed.join(","));
check("modificador de um slot não afeta outro slot", same(resolveAction("archer", "skill2", [mod]), resolveAction("archer", "skill2")));
const setMod: ActionModifier = { id: "teste-set", set: { cd: 2 } };
check("modificador 'set' troca só o campo dado", same(resolveAction("mage", "attack", [setMod]), { ...resolveAction("mage", "attack"), cd: 2 }));
check("lista de modificadores vazia não altera nada", same(resolveAction("mage", "ultimate", []), resolveAction("mage", "ultimate")));
check("CLASS_DEFS segue igual ao snapshot depois de usar modificadores", same(CLASS_DEFS.archer.actions.skill1, SNAPSHOT.archer.actions.skill1));

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} verificações passaram`);
if (passed !== results.length) process.exit(1);

