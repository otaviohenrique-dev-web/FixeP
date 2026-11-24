// Gera docs/BALANCEAMENTO_SIMULACAO.md a partir da simulação pura de @frixep/shared (C2.5). Sem servidor, sem banco, sem rede.
// Uso (na raiz do repositório): npx tsx tools/simular_balanceamento.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CLASS_DEFS, PLAYABLE_CLASSES, SIM_NIVEIS, SIM_JANELA_S, SIM_BURST_S, SIM_OUTLIER, ALVO_ARMADURA_PCT, METRICA_DO_PAPEL,
  simularTudo, mediana, outliersDaClasse, desviosDePapel, enemyHp, type CharClass, type MetricaSim, type ResultadoBuild,
} from "@frixep/shared";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = simularTudo();
const f = (n: number, casas = 1) => (Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) : "—");
const pct = (r: number) => `${r >= 1 ? "+" : ""}${Math.round((r - 1) * 100)}%`;
const nomes = Object.fromEntries(PLAYABLE_CLASSES.map((c) => [c, CLASS_DEFS[c].name])) as Record<CharClass, string>;
const doNivel = (cls: CharClass, nivel: number): ResultadoBuild[] => res.filter((r) => r.build.cls === cls && r.build.nivel === nivel);
const sumario = (xs: number[]) => ({ med: mediana(xs), min: Math.min(...xs), max: Math.max(...xs) });

const linhas: string[] = [];
const p = (s = "") => linhas.push(s);

p("# Simulação de balanceamento (C2.5)");
p();
p("> Gerado por `tools/simular_balanceamento.ts` (`npx tsx tools/simular_balanceamento.ts`, na raiz). Não editar à mão: rode o script de novo.");
p("> Fonte única: `packages/shared/src/simulacao.ts`, que usa `resolveAction`/`classAction`, variações (`variacoes.ts`), talentos (`talentos.ts`), `dmgMult`, `defenseMult`, `enemyHp` e `CRIT` reais do jogo.");
p();
p("## Premissas");
p();
p(`- **Alvo de referência:** Esqueleto do nível (vida de \`enemyHp\`): ${SIM_NIVEIS.map((n) => `N${n} = ${f(enemyHp(n), 0)}`).join(" · ")}.`);
p(`- **Armadura do alvo (premissa da simulação, não é regra do jogo):** ${SIM_NIVEIS.map((n) => `N${n} ${ALVO_ARMADURA_PCT[n]}%`).join(" · ")}. Os inimigos do jogo hoje não têm armadura.`);
p(`- **Janela:** ${SIM_JANELA_S} s de luta contínua, rotação "gananciosa" (ultimate, E, W, Q, ataque básico, como em \`balance.ts\`), recurso regenerando, passo de ${0.05} s. Burst = dano nos primeiros ${SIM_BURST_S} s.`);
p("- **Sem equipamento e sem afixos de item** (só classe, nível, variações e talentos, como pede o card). Crítico entra como valor esperado; esquiva e atraso de telegrafo de área ficam de fora.");
p("- **Builds:** toda combinação de variações das habilidades já desbloqueadas (base ou uma das 3 de cada slot; Q no nível 10, W 20, E 30, R 40) × 4 opções de talento (nenhum, ou o ramo inteiro preenchido nos 3 ramos). Clérigo sempre com Cura em Área (qMode 0).");
p(`- **Sobrevivência:** vida efetiva = vida × defesa do nível / (1 − redução), redução = escudo (ação com \`reduction\`, pela fração do tempo ativo) + talentos de redução, teto 80%.`);
p(`- **Outliers:** build com mais de ${Math.round((SIM_OUTLIER.teto - 1) * 100)}% acima ou ${Math.round((1 - SIM_OUTLIER.piso) * 100)}% abaixo da mediana das builds da própria classe no mesmo nível (dps). **Classe fora do papel:** a métrica do papel (dano = dps; tanque = vida efetiva; suporte = cura) fora de ${Math.round(SIM_OUTLIER.desvioClasse * 100)}% da mediana das classes do mesmo papel. Só o papel "dano" tem duas classes (Arqueiro e Mago); Guerreiro (tanque) e Clérigo (suporte) não têm par, então essa checagem não se aplica a eles e aparece como "sem par".`);
p(`- **Total:** ${res.length} builds simuladas (${PLAYABLE_CLASSES.length} classes × ${SIM_NIVEIS.length} níveis).`);
p();

p("## Tabelas por classe e nível");
p();
p("Colunas: dps (sustentado), burst (primeiros 3 s), vida efetiva, cura/s, controle (s sob atordoamento + lentidão + enraizamento, por alvo, na janela de 30 s) e TTK do alvo de referência (s). Valores: **mediana** das builds, com faixa (mín–máx).");
p();
for (const cls of PLAYABLE_CLASSES) {
  p(`### ${nomes[cls]} (papel: ${CLASS_DEFS[cls].role})`);
  p();
  p("| Nível | Builds | dps (med · mín–máx) | burst | vida efetiva | cura/s | controle (s) | TTK (s) |");
  p("|---:|---:|---|---:|---:|---:|---:|---:|");
  for (const nivel of SIM_NIVEIS) {
    const g = doNivel(cls, nivel);
    const dps = sumario(g.map((r) => r.m.dps));
    const burst = mediana(g.map((r) => r.m.burst));
    const hp = mediana(g.map((r) => r.m.hpEf));
    const cura = mediana(g.map((r) => r.m.cura));
    const ctrl = mediana(g.map((r) => r.m.atordoado + r.m.lento + r.m.enraizado));
    const ttk = mediana(g.map((r) => r.m.ttk));
    p(`| ${nivel} | ${g.length} | ${f(dps.med)} (${f(dps.min)}–${f(dps.max)}) | ${f(burst)} | ${f(hp, 0)} | ${f(cura)} | ${f(ctrl)} | ${f(ttk)} |`);
  }
  p();
}

p("## Outliers dentro de cada classe (dps)");
p();
const outs = outliersDaClasse(res, "dps");
if (outs.length === 0) p("Nenhum build fora de +25% / −25% da mediana da própria classe e nível.");
else {
  p(`${outs.length} builds fora da faixa. Por classe e nível:`);
  p();
  p("| Classe | Nível | acima | abaixo | maior desvio |");
  p("|---|---:|---:|---:|---|");
  for (const cls of PLAYABLE_CLASSES) for (const nivel of SIM_NIVEIS) {
    const o = outs.filter((x) => x.build.cls === cls && x.build.nivel === nivel);
    if (o.length === 0) continue;
    const top = [...o].sort((a, b) => Math.abs(b.razao - 1) - Math.abs(a.razao - 1))[0];
    p(`| ${nomes[cls]} | ${nivel} | ${o.filter((x) => x.motivo === "acima").length} | ${o.filter((x) => x.motivo === "abaixo").length} | ${pct(top.razao)} · ${top.build.rotulo} |`);
  }
}
p();
p("## Outliers de outras métricas (contagem; limite igual ao do dps)");
p();
p("| Métrica | Builds fora da faixa |");
p("|---|---:|");
for (const m of ["burst", "hpEf", "cura", "ttk"] as MetricaSim[]) p(`| ${m} | ${outliersDaClasse(res, m).length} |`);
p();

p("## Classe fora do papel");
p();
const desv = desviosDePapel(res);
if (desv.length === 0) p("Nenhuma classe fora de 30% da mediana do próprio papel onde há par para comparar.");
else {
  p("| Classe | Nível | Métrica do papel | Mediana da classe | Mediana do papel | Diferença |");
  p("|---|---:|---|---:|---:|---:|");
  for (const d of desv) p(`| ${nomes[d.cls]} | ${d.nivel} | ${d.metrica} | ${f(d.valor)} | ${f(d.medPapel)} | ${pct(d.razao)} |`);
}
for (const cls of PLAYABLE_CLASSES) {
  const m = METRICA_DO_PAPEL[cls];
  const par = PLAYABLE_CLASSES.filter((o) => METRICA_DO_PAPEL[o] === m).length >= 2;
  if (!par) p(`- ${nomes[cls]}: sem par no papel (métrica \`${m}\`): não há mediana de comparação.`);
}
p();

p("## Como ler");
p();
p("- Outlier não é erro automático: é o ponto para olhar. O teste `packages/server/test/simulacao.unit.ts` trava um teto (configurável lá) para o que passar disso.");
p("- Os números são medidos sobre a janela de 30 s e o alvo de referência; comparam builds entre si, não são previsão de combate real.");
p();

const destino = join(raiz, "docs", "BALANCEAMENTO_SIMULACAO.md");
writeFileSync(destino, linhas.join("\n") + "\n", "utf8");
console.log(`Relatório gravado em ${destino} (${res.length} builds, ${outs.length} outliers de dps, ${desv.length} desvios de papel).`);
