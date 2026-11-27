// Teste unitário do loadout de equipamento (C3.6): aplicar o conjunto salvo no slot troca as peças vestidas,
// ignora peças que o jogador não tem mais, não duplica nem perde item, respeita nível e classe e é tudo ou nada.
// Uso: npx tsx test/loadout-equip.unit.ts
import { ITEMS, INV_SLOTS, EQUIP_SLOTS, limparLoadouts, loadoutsVazio, type EquipSnap } from "@frixep/shared";
import { emptyInventory, type Inventory } from "../src/game/inventory.js";
import { aplicarEquipBuild } from "../src/game/loadoutEquip.js";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

// ids reais do jogo (mesmo padrão de items.ts): armaduras de guerreiro e arqueiro, capacetes, material para encher a mochila
const ids = (prefixo: string) => Object.keys(ITEMS).filter((k) => k.startsWith(prefixo) && ITEMS[k].rarity !== "junk").sort((a, b) => ITEMS[a].minLevel - ITEMS[b].minLevel);
const armaduras = ids("warrior_armor_");
const capacetes = ids("warrior_helmet_");
const armaduraArq = ids("archer_armor_");
const material = Object.keys(ITEMS).find((k) => ITEMS[k].kind === "material")!;
const A1 = armaduras[0], A2 = armaduras[1], H1 = capacetes[0], H2 = capacetes[1];
const NIVEL_ALTO = 100;

// conta quantas cópias de um item existem (mochila + vestido): precisa ficar igual antes e depois
const copias = (inv: Inventory, id: string) =>
  inv.slots.reduce((n, s) => n + (s?.id === id ? s.qty : 0), 0) + EQUIP_SLOTS.filter((s) => inv.equip[s] === id).length;
const total_itens = (inv: Inventory) => inv.slots.reduce((n, s) => n + (s ? s.qty : 0), 0) + EQUIP_SLOTS.filter((s) => inv.equip[s]).length;
const snap = (id: string, extra: Partial<EquipSnap> = {}): EquipSnap => ({ id, ...extra });

console.log("== Pré-requisitos do teste");
check("há armaduras e capacetes de guerreiro no catálogo", armaduras.length >= 2 && capacetes.length >= 2 && !!material);

console.log("== Aplicar troca as peças vestidas");
{
  const inv = emptyInventory();
  inv.equip.armor = A1;
  inv.slots[0] = { id: A2, qty: 1 };
  const r = aplicarEquipBuild(inv, { armor: snap(A2) }, "warrior", NIVEL_ALTO);
  check("aplicar devolve ok", r.ok === true);
  check("a armadura do build passa a estar vestida", inv.equip.armor === A2);
  check("a armadura trocada vai para a mochila (nada perdido)", inv.slots.some((s) => s?.id === A1));
  check("a peça da mochila saiu da mochila (sem duplicar)", !inv.slots.some((s) => s?.id === A2));
  check("total de itens se mantém", total_itens(inv) === 2);
}

console.log("== Peça que não existe mais é ignorada");
{
  const inv = emptyInventory();
  inv.equip.armor = A1;
  inv.equip.helmet = H1; // vestido agora, mas o build pede outro capacete que o jogador não tem
  inv.slots[0] = { id: A2, qty: 1 }; // a armadura do build existe na mochila
  const antes = total_itens(inv);
  const r = aplicarEquipBuild(inv, { armor: snap(A2), helmet: snap(H2) }, "warrior", NIVEL_ALTO);
  check("aplicar com peça faltando continua ok", r.ok === true);
  check("a peça faltando aparece na lista de ignoradas", r.ok && r.faltando.length === 1 && r.faltando[0] === "helmet");
  check("o slot da peça faltando mantém o que já vestia", inv.equip.helmet === H1);
  check("a peça que existe é aplicada mesmo assim", inv.equip.armor === A2);
  check("nada é perdido com a peça faltando", total_itens(inv) === antes && copias(inv, H1) === 1);
}
{
  // build com peça que nunca existiu no inventário, e o slot vestido vazio: nada muda nesse slot
  const inv = emptyInventory();
  const r = aplicarEquipBuild(inv, { helmet: snap(H2) }, "warrior", NIVEL_ALTO);
  check("peça ausente com slot vazio não vira nada", r.ok && inv.equip.helmet === null && total_itens(inv) === 0);
}

console.log("== Itens nunca são duplicados");
{
  // duas cópias de A2 (uma vestida, uma na mochila): o build pede uma só, então continuam 2 cópias, não 3
  const inv = emptyInventory();
  inv.equip.armor = A2;
  inv.slots[0] = { id: A2, qty: 1 };
  const r = aplicarEquipBuild(inv, { armor: snap(A2) }, "warrior", NIVEL_ALTO);
  check("aplicar com duas cópias é ok", r.ok === true);
  check("continuam exatamente 2 cópias de A2 (não duplicou)", copias(inv, A2) === 2);
  check("a peça vestida é a mesma que o build pediu", inv.equip.armor === A2);
}
{
  // o build pede A2 e a única cópia está em outro slot de equipamento: não é possível usá-la duas vezes
  const inv = emptyInventory();
  inv.equip.armor = A1;
  inv.equip.helmet = null;
  inv.slots[0] = { id: A2, qty: 1 };
  const r = aplicarEquipBuild(inv, { armor: snap(A2), helmet: snap(H1) }, "warrior", NIVEL_ALTO);
  check("pedir peça que não existe em outro slot não cria cópia", r.ok && r.faltando.includes("helmet") && copias(inv, H1) === 0);
}

console.log("== Afixos e refino fazem parte da identidade da peça");
{
  const inv = emptyInventory();
  inv.slots[0] = { id: A2, qty: 1, rf: 2 }; // refinada em +2
  const r = aplicarEquipBuild(inv, { armor: snap(A2, { rf: 5 }) }, "warrior", NIVEL_ALTO);
  check("peça com refino diferente é tratada como faltando", r.ok && r.faltando.includes("armor") && inv.slots[0]?.rf === 2);
}

console.log("== Desvestir e mochila cheia");
{
  const inv = emptyInventory();
  inv.equip.armor = A1;
  const r = aplicarEquipBuild(inv, {}, "warrior", NIVEL_ALTO); // build sem armadura: tira a peça
  check("build vazio desveste a peça para a mochila", r.ok && inv.equip.armor === null && inv.slots.some((s) => s?.id === A1));
}
{
  const inv = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) inv.slots[i] = { id: material, qty: 1 };
  inv.equip.armor = A1;
  const antes = JSON.stringify(inv);
  const r = aplicarEquipBuild(inv, {}, "warrior", NIVEL_ALTO); // precisa de espaço para A1 e não há
  check("mochila cheia recusa e não muda nada", !r.ok && JSON.stringify(inv) === antes);
  check("a recusa explica o motivo", !r.ok && /Mochila cheia/.test(r.error));
}

console.log("== Nível e classe");
{
  const inv = emptyInventory();
  inv.slots[0] = { id: A2, qty: 1 };
  const alto = ITEMS[A2].minLevel;
  const r = aplicarEquipBuild(inv, { armor: snap(A2) }, "warrior", Math.max(1, alto - 1));
  check("peça acima do nível atual é recusada com o motivo", !r.ok && /requer nível/.test(r.error) && inv.slots[0]?.id === A2);
}
{
  const inv = emptyInventory();
  inv.slots[0] = { id: armaduraArq[0], qty: 1 };
  const r = aplicarEquipBuild(inv, { armor: snap(armaduraArq[0]) }, "warrior", NIVEL_ALTO);
  check("peça de outra classe é recusada", !r.ok && /outra classe/.test(r.error));
}

console.log("== Dado salvo e lido de novo");
{
  // o build salvo com lixo (item apagado, afixo inválido) é limpo na leitura, sem derrubar o slot
  const lo = loadoutsVazio();
  const lido = limparLoadouts({ slots: [{ nome: "Tanque", salvo: true, equipSalvo: true, equip: { armor: { id: A2 }, helmet: { id: "item_que_nao_existe" } } }] }, "warrior");
  check("o slot salvo volta com o nome e a peça válida", lido.slots[0].nome === "Tanque" && lido.slots[0].equip?.armor?.id === A2);
  check("a peça de id inexistente some ao ler", lido.slots[0].equip?.helmet === undefined);
  check("slot sem equipamento salvo começa como não salvo", lo.slots.every((s) => s.equipSalvo === false));
}

console.log(`\n${total - falhas}/${total} verificações passaram`);
if (falhas) process.exit(1);
