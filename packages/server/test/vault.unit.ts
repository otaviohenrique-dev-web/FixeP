// Testes unitários do baú (regras puras + banco embutido): limites de espaço, conservação de itens, moedas e persistência atômica.
// Uso: npx tsx test/vault.unit.ts
import { randomUUID } from "node:crypto";
import { ITEMS, INV_SLOTS, VAULT_SLOTS, VAULT_PAGE, VAULT_PAGES, VAULT_COIN_MAX } from "@frixep/shared";
import { emptyInventory, addItem } from "../src/game/inventory.js";
import { emptyVault, deposit, withdraw, moveInVault, moveCoins } from "../src/game/vault.js";
import { openDb } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const total = (inv: ReturnType<typeof emptyInventory>, v: ReturnType<typeof emptyVault>, id: string) =>
  [...inv.slots, ...v.slots].reduce((a, s) => a + (s && s.id === id ? s.qty : 0), 0);

const gear = Object.keys(ITEMS).filter((k) => ITEMS[k].kind !== "potion" && ITEMS[k].stack === 1);

console.log("== Tamanho ==");
check("o baú tem 180 espaços (6 páginas de 30)", VAULT_SLOTS === 180 && VAULT_PAGE * VAULT_PAGES === 180 && emptyVault().slots.length === 180);
check("muito maior que a mochila", VAULT_SLOTS >= INV_SLOTS * 5);

console.log("\n== Depositar e retirar ==");
{
  const inv = emptyInventory(), v = emptyVault();
  addItem(inv, gear[0], 1); addItem(inv, "pocao_de_vida", 5);
  check("depositar equipamento", deposit(inv, v, 0, undefined).ok && inv.slots[0] === null && v.slots[0]?.id === gear[0]);
  check("depositar parte de uma pilha", deposit(inv, v, 1, 2).ok && inv.slots[1]?.qty === 3 && v.slots[1]?.qty === 2);
  check("depositar mais da mesma pilha junta no baú", deposit(inv, v, 1, 3).ok && inv.slots[1] === null && v.slots[1]?.qty === 5);
  check("quantidade maior que a pilha vira a pilha inteira (nunca cria item)", (() => { addItem(inv, "pocao_de_vida", 2); return deposit(inv, v, 0, 99).ok && total(inv, v, "pocao_de_vida") === 7; })());
  check("retirar de volta", withdraw(inv, v, 0, undefined).ok && v.slots[0] === null && total(inv, v, gear[0]) === 1);
  check("espaço vazio, inválido e quantidades ruins são recusados", [deposit(inv, v, 19, 1), deposit(inv, v, -1, 1), deposit(inv, v, 0.5, 1), deposit(inv, v, 1, 0), deposit(inv, v, 1, -1), deposit(inv, v, 1, 1.5), deposit(inv, v, 1, "x"), withdraw(inv, v, 500, 1), withdraw(inv, v, 100, 1)].every((r) => !r.ok));
}

console.log("\n== Limite de espaços ==");
{
  const inv = emptyInventory(), v = emptyVault();
  for (let i = 0; i < VAULT_SLOTS; i++) v.slots[i] = { id: gear[i % gear.length], qty: 1 };
  addItem(inv, gear[0], 1);
  const snapI = JSON.stringify(inv.slots), snapV = JSON.stringify(v.slots);
  const r = deposit(inv, v, 0, undefined);
  check("baú cheio: o depósito é recusado e NADA muda", !r.ok && JSON.stringify(inv.slots) === snapI && JSON.stringify(v.slots) === snapV, JSON.stringify(r));
  const full = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) full.slots[i] = { id: gear[i], qty: 1 };
  const v2 = emptyVault(); v2.slots[5] = { id: gear[0], qty: 1 };
  const r2 = withdraw(full, v2, 5, undefined);
  check("mochila cheia: a retirada é recusada e o item fica no baú", !r2.ok && v2.slots[5]?.id === gear[0]);
}

console.log("\n== Mover dentro do baú ==");
{
  const v = emptyVault();
  v.slots[0] = { id: "pocao_de_vida", qty: 6 }; v.slots[3] = { id: "pocao_de_vida", qty: 7 }; v.slots[9] = { id: gear[0], qty: 1 };
  const t0 = total(emptyInventory(), v, "pocao_de_vida");
  check("juntar pilhas respeita o limite da pilha e conserva a soma", moveInVault(v, 0, 3).ok && total(emptyInventory(), v, "pocao_de_vida") === t0 && (v.slots[3]?.qty ?? 0) <= ITEMS.pocao_de_vida.stack);
  check("trocar de lugar com item diferente", moveInVault(v, 9, 3).ok && v.slots[9]?.id === "pocao_de_vida" && v.slots[3]?.id === gear[0]);
  check("origem vazia e espaços inválidos são recusados", !moveInVault(v, 100, 3).ok && !moveInVault(v, 0, 999).ok && !moveInVault(v, "a", 1).ok);
}

console.log("\n== Moedas ==");
{
  const inv = emptyInventory(), v = emptyVault();
  inv.iron = 1000; inv.obols = 3;
  check("depositar e retirar tostões conserva o total", moveCoins(inv, v, "iron", 400, "in").ok && inv.iron === 600 && v.iron === 400 && moveCoins(inv, v, "iron", 100, "out").ok && inv.iron + v.iron === 1000);
  check("acima do saldo, zero, negativo, fracionado, NaN e enorme são recusados", [moveCoins(inv, v, "iron", 99999, "in"), moveCoins(inv, v, "iron", 0, "in"), moveCoins(inv, v, "iron", -1, "in"), moveCoins(inv, v, "iron", 1.5, "in"), moveCoins(inv, v, "iron", NaN, "in"), moveCoins(inv, v, "iron", 1e15, "out"), moveCoins(inv, v, "ouro", 1, "in"), moveCoins(inv, v, "iron", 1, "x")].every((r) => !r.ok) && inv.iron + v.iron === 1000);
  inv.iron = VAULT_COIN_MAX; v.iron = 5;
  check("o teto de moedas da mochila é respeitado ao retirar", !moveCoins(inv, v, "iron", 5, "out").ok && inv.iron === VAULT_COIN_MAX && v.iron === 5);
}

console.log("\n== Persistência (banco) ==");
{
  const db = await openDb();
  const repo = new Repo(db);
  const acct = await repo.upsertAccount("test", randomUUID(), "Cofre");
  const created = await repo.createCharacter(acct.id, "Cofre" + Math.random().toString(36).slice(2, 7), "warrior");
  if (!created.ok) throw new Error("criar personagem");
  const id = created.character.id;
  check("personagem novo nasce na cidade (zona 4)", created.character.zone === 4 || process.env.TEST_START_ZONE !== undefined, String(created.character.zone));
  const inv = emptyInventory(), v = emptyVault();
  addItem(inv, gear[0], 1); addItem(inv, gear[1], 1); addItem(inv, "pocao_de_vida", 8); inv.iron = 700;
  deposit(inv, v, 0, undefined, 33); deposit(inv, v, 2, 5, 100); moveCoins(inv, v, "iron", 300, "in");
  await repo.saveInventoryAndVault(id, inv, v);
  const li = await repo.loadInventory(id, "warrior"), lv = await repo.loadVault(id);
  check("baú gravado e relido: mesmos espaços, quantidades e moedas", lv.slots[33]?.id === gear[0] && lv.slots[100]?.id === "pocao_de_vida" && lv.slots[100].qty === 5 && lv.iron === 300);
  check("bolsa gravada na mesma transação (sem duplicar o que foi guardado)", li.iron === 400 && li.slots.filter((s) => s?.id === gear[0]).length === 0 && li.slots.some((s) => s?.id === "pocao_de_vida" && s.qty === 3) && li.slots.some((s) => s?.id === gear[1]));
  const withdrawn = withdraw(inv, v, 33, undefined);
  await repo.saveInventoryAndVault(id, inv, v);
  const lv2 = await repo.loadVault(id), li2 = await repo.loadInventory(id, "warrior");
  check("retirar e gravar: o item muda de lado, nunca nos dois", withdrawn.ok && lv2.slots[33] === null && li2.slots.some((s) => s?.id === gear[0]));
  const acct2 = await repo.upsertAccount("test", randomUUID(), "Outro");
  const c2 = await repo.createCharacter(acct2.id, "Outro" + Math.random().toString(36).slice(2, 7), "mage");
  if (!c2.ok) throw new Error("criar 2");
  const other = await repo.loadVault(c2.character.id);
  check("o baú é por personagem: o de outro jogador está vazio", other.slots.every((s) => s === null) && other.iron === 0);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
