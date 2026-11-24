// Testes da regra pura da janela de preços (sem banco): ordenação pelo preço por unidade e resumo por moeda.
// Uso (na raiz): npx tsx packages/shared/src/mercado_precos.unit.ts   (ou npm run test:precos:unit -w @frixep/server)
import { sortByUnitPrice, summarizePrices, priceHeadline, type PriceRow } from "./mercado_precos";

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  if (!ok) fails++;
};
const R = (id: string, qty: number, price: number, currency: "iron" | "obols" = "iron"): PriceRow => ({ id, qty, price, currency });

const rows: PriceRow[] = [
  R("a", 1, 300), // unidade 300
  R("b", 10, 1500), // unidade 150 (pilha mais barata por unidade, preço total maior)
  R("c", 4, 800), // unidade 200
  R("d", 2, 300), // unidade 150: empata com b; b tem preço total maior, então d vem antes
  R("o1", 1, 5, "obols"), // outra moeda: não entra no iron
  R("o2", 2, 1, "obols"), // unidade 0.5: menor de todas, mas é Óbolos
];

const iron = sortByUnitPrice(rows, "iron");
check("ordena pelo preço por unidade (do mais barato ao mais caro)", iron.map((r) => r.id).join(",") === "d,b,c,a", iron.map((r) => r.id).join(","));
check("empate de unidade desempata pelo preço total (menor primeiro)", iron[0].id === "d" && iron[1].id === "b");
check("não mistura moedas: nenhuma listagem de Óbolos entra na lista de Tostões", iron.every((r) => r.currency === "iron"));

const s = summarizePrices(rows, "iron");
check("mais barato por unidade (Tostões) = 150", s.cheapest === 150, String(s.cheapest));
check("mais caro por unidade (Tostões) = 300", s.dearest === 300, String(s.dearest));

const o = summarizePrices(rows, "obols");
check("Óbolos têm resumo próprio: mais barato 0,5 e mais caro 5", o.cheapest === 0.5 && o.dearest === 5, `${o.cheapest}/${o.dearest}`);

const vazio = summarizePrices([], "iron");
check("sem listagens: mais barato e mais caro são null", vazio.cheapest === null && vazio.dearest === null && vazio.rows.length === 0);
check("texto sem listagens = mensagem de definir o preço", priceHeadline(vazio, "Tostões") === "Nenhuma listagem deste item agora: você define o preço");
check("texto com listagens traz mais barato e mais caro", /Mais barato: 150 Tostões · Mais caro: 300 Tostões/.test(priceHeadline(s, "Tostões")), priceHeadline(s, "Tostões"));

const ignora = sortByUnitPrice([R("z", 0, 10)], "iron");
check("quantidade zero é ignorada (não divide por zero)", ignora.length === 0);

const entrada = rows.map((r) => r.id).join(",");
sortByUnitPrice(rows, "iron");
check("a entrada não é alterada", rows.map((r) => r.id).join(",") === entrada);

if (fails) { console.log(`\n${fails} verificação(ões) falharam`); process.exit(1); }
console.log("\nTodas as verificações passaram.");
