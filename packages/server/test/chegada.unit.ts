// Teste estático (sem servidor) da chegada nas zonas: TODO ponto de chegada (`arrive` de cada origem) e o `spawn` de cada zona
// ficam fora do alcance de pisar no portão e numa clareira sem inimigos (comuns nem chefe), considerando o aggro de cada tipo e a coleira.
// Uso: npx tsx test/chegada.unit.ts
import { ZONES, expandSpawns, enemyKind, ARRIVAL_SAFE_RADIUS, ARRIVAL_GATE_DIST, ARRIVAL_SHIELD_S, WORLD_GATE, PORTAL_TRIGGER_RADIUS } from "@frixep/shared";

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

for (const z of Object.values(ZONES)) {
  const pts: [string, { x: number; y: number }][] = [["spawn", z.spawn], ...Object.entries(z.arrive).map(([from, p]) => [`chegada vindo da zona ${from}`, p] as [string, { x: number; y: number }])];
  const enemies = expandSpawns(z).map((e, i) => ({ id: `e${i + 1}`, ...e }));
  if (z.boss) enemies.push({ id: "boss", kind: z.boss.kind, x: z.boss.x, y: z.boss.y, level: z.boss.level });
  for (const [name, p] of pts) {
    const inside = p.x >= 1 && p.y >= 1 && p.x <= z.w - 2 && p.y <= z.h - 2;
    let md = Infinity, who = "";
    for (const e of enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < md) { md = d; who = e.id; } }
    check(`${z.name} · ${name}: dentro do mapa`, inside, `(${p.x}, ${p.y})`);
    check(`${z.name} · ${name}: nenhum inimigo a menos de ${ARRIVAL_SAFE_RADIUS} tiles`, md >= ARRIVAL_SAFE_RADIUS, `mais perto: ${who} a ${md.toFixed(1)}`);
    // o aggro de cada tipo cabe dentro do raio seguro com folga; a coleira só vale a partir do ponto de origem do inimigo
    const worst = enemies.reduce((m, e) => Math.max(m, enemyKind(e.kind).aggro), 0);
    check(`${z.name} · ${name}: o raio seguro cobre o maior aggro (${worst}) com folga`, ARRIVAL_SAFE_RADIUS >= worst + 3);
    const gd = Math.min(...z.portals.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
    check(`${z.name} · ${name}: fora do alcance de pisar em qualquer portão (≥ ${ARRIVAL_GATE_DIST - 0.1} tiles)`, gd >= ARRIVAL_GATE_DIST - 0.1 && gd > PORTAL_TRIGGER_RADIUS + 1, `portão mais perto a ${gd.toFixed(1)}`);
  }
  // quem chega de uma zona aparece junto do portão de volta para essa zona
  for (const [from, p] of Object.entries(z.arrive)) {
    const back = z.portals.find((q) => q.to === Number(from)) ?? (z.safe ? z.portals.find((q) => q.to === WORLD_GATE) : undefined);
    check(`${z.name}: chegada vindo da zona ${from} é junto do portão que leva de volta`, !!back && Math.hypot(back.x - p.x, back.y - p.y) <= ARRIVAL_GATE_DIST + 1.2);
  }
}
check("os ids dos primeiros inimigos das Cinzas não mudaram (e1 e2 e3)", (() => { const e = expandSpawns(ZONES[1]); return e[0].x === 30 && e[0].y === 16 && e[1].x === 31 && e[1].y === 24 && e[2].x === 26 && e[2].y === 30; })());
check("a bolha de chegada dura alguns segundos", ARRIVAL_SHIELD_S >= 5 && ARRIVAL_SHIELD_S <= 12, String(ARRIVAL_SHIELD_S));
console.log(fails ? `\n${fails} FALHA(S)` : "\nTudo certo.");
process.exit(fails ? 1 : 0);
