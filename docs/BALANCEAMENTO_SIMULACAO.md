# Simulação de balanceamento (C2.5)

> Gerado por `tools/simular_balanceamento.ts` (`npx tsx tools/simular_balanceamento.ts`, na raiz). Não editar à mão: rode o script de novo.
> Fonte única: `packages/shared/src/simulacao.ts`, que usa `resolveAction`/`classAction`, variações (`variacoes.ts`), talentos (`talentos.ts`), `dmgMult`, `defenseMult`, `enemyHp` e `CRIT` reais do jogo.

## Premissas

- **Alvo de referência:** Esqueleto do nível (vida de `enemyHp`): N10 = 222 · N20 = 402 · N30 = 582 · N40 = 762 · N50 = 942.
- **Armadura do alvo (premissa da simulação, não é regra do jogo):** N10 0% · N20 10% · N30 20% · N40 30% · N50 40%. Os inimigos do jogo hoje não têm armadura.
- **Janela:** 30 s de luta contínua, rotação "gananciosa" (ultimate, E, W, Q, ataque básico, como em `balance.ts`), recurso regenerando, passo de 0.05 s. Burst = dano nos primeiros 3 s.
- **Sem equipamento e sem afixos de item** (só classe, nível, variações e talentos, como pede o card). Crítico entra como valor esperado; esquiva e atraso de telegrafo de área ficam de fora.
- **Builds:** toda combinação de variações das habilidades já desbloqueadas (base ou uma das 3 de cada slot; Q no nível 10, W 20, E 30, R 40) × 4 opções de talento (nenhum, ou o ramo inteiro preenchido nos 3 ramos). Clérigo sempre com Cura em Área (qMode 0).
- **Sobrevivência:** vida efetiva = vida × defesa do nível / (1 − redução), redução = escudo (ação com `reduction`, pela fração do tempo ativo) + talentos de redução, teto 80%.
- **Outliers:** build com mais de 25% acima ou 25% abaixo da mediana das builds da própria classe no mesmo nível (dps). **Classe fora do papel:** a métrica do papel (dano = dps; tanque = vida efetiva; suporte = cura) fora de 30% da mediana das classes do mesmo papel. Só o papel "dano" tem duas classes (Arqueiro e Mago); Guerreiro (tanque) e Clérigo (suporte) não têm par, então essa checagem não se aplica a eles e aparece como "sem par".
- **Total:** 9536 builds simuladas (4 classes × 5 níveis).

## Tabelas por classe e nível

Colunas: dps (sustentado), burst (primeiros 3 s), vida efetiva, cura/s, controle (s sob atordoamento + lentidão + enraizamento, por alvo, na janela de 30 s) e TTK do alvo de referência (s). Valores: **mediana** das builds, com faixa (mín–máx).

### Guerreiro (papel: Tanque)

| Nível | Builds | dps (med · mín–máx) | burst | vida efetiva | cura/s | controle (s) | TTK (s) |
|---:|---:|---|---:|---:|---:|---:|---:|
| 10 | 16 | 39,6 (39,3–46,0) | 205,9 | 394 | 0,0 | 24,1 | 5,6 |
| 20 | 64 | 54,6 (51,8–67,7) | 285,8 | 894 | 0,0 | 25,0 | 7,4 |
| 30 | 256 | 64,0 (60,6–87,5) | 334,7 | 1.543 | 0,0 | 25,0 | 9,1 |
| 40 | 1024 | 69,9 (65,8–96,1) | 375,5 | 2.314 | 0,0 | 25,0 | 10,9 |
| 50 | 1024 | 71,5 (67,4–98,3) | 384,4 | 3.241 | 0,0 | 25,0 | 13,2 |

### Arqueiro (papel: Dano à distância)

| Nível | Builds | dps (med · mín–máx) | burst | vida efetiva | cura/s | controle (s) | TTK (s) |
|---:|---:|---|---:|---:|---:|---:|---:|
| 10 | 16 | 48,8 (47,6–56,9) | 191,1 | 293 | 0,0 | 15,0 | 4,5 |
| 20 | 64 | 72,5 (62,8–84,2) | 289,2 | 632 | 0,0 | 12,5 | 5,6 |
| 30 | 256 | 86,2 (73,5–108,9) | 344,0 | 1.110 | 0,0 | 12,5 | 6,8 |
| 40 | 1024 | 93,8 (79,8–118,9) | 381,1 | 1.687 | 0,0 | 12,5 | 8,2 |
| 50 | 1024 | 96,1 (81,7–121,7) | 390,1 | 2.384 | 0,0 | 12,5 | 9,9 |

### Clérigo (papel: Suporte)

| Nível | Builds | dps (med · mín–máx) | burst | vida efetiva | cura/s | controle (s) | TTK (s) |
|---:|---:|---|---:|---:|---:|---:|---:|
| 10 | 16 | 21,8 (21,8–25,1) | 104,7 | 293 | 4,9 | 0,0 | 10,2 |
| 20 | 64 | 28,7 (28,7–35,3) | 138,1 | 621 | 7,2 | 0,0 | 14,0 |
| 30 | 256 | 33,7 (33,7–46,3) | 161,8 | 1.069 | 10,0 | 0,0 | 17,3 |
| 40 | 1024 | 36,5 (36,5–50,3) | 175,6 | 1.637 | 13,6 | 0,0 | 20,9 |
| 50 | 1024 | 37,4 (37,4–51,5) | 179,8 | 2.325 | 16,2 | 0,0 | 25,2 |

### Mago (papel: Dano explosivo)

| Nível | Builds | dps (med · mín–máx) | burst | vida efetiva | cura/s | controle (s) | TTK (s) |
|---:|---:|---|---:|---:|---:|---:|---:|
| 10 | 16 | 37,3 (35,2–42,6) | 242,9 | 254 | 0,0 | 4,4 | 6,0 |
| 20 | 64 | 49,3 (46,4–57,9) | 325,1 | 567 | 0,0 | 4,4 | 8,1 |
| 30 | 256 | 61,1 (54,3–74,9) | 393,2 | 1.000 | 0,0 | 4,4 | 9,6 |
| 40 | 1024 | 66,8 (58,9–82,7) | 436,1 | 1.553 | 0,0 | 5,0 | 11,4 |
| 50 | 1024 | 68,4 (60,3–84,6) | 446,3 | 2.226 | 0,0 | 5,0 | 13,8 |

## Outliers dentro de cada classe (dps)

1440 builds fora da faixa. Por classe e nível:

| Classe | Nível | acima | abaixo | maior desvio |
|---|---:|---:|---:|---|
| Guerreiro | 30 | 64 | 0 | +37% · skill1=w_inv_pesada;skill2=w_cor_pesada · ramo Fúria |
| Guerreiro | 40 | 256 | 0 | +38% · skill1=w_inv_pesada;skill2=w_cor_pesada;ultimate=w_col_pesado · ramo Fúria |
| Guerreiro | 50 | 256 | 0 | +38% · skill1=w_inv_veloz;ultimate=w_col_pesado · ramo Fúria |
| Arqueiro | 30 | 32 | 0 | +26% · skill1=a_per_pesada;skill2=a_cil_explosiva · ramo Precisão |
| Arqueiro | 40 | 128 | 0 | +27% · skill1=a_per_pesada;skill2=a_cil_explosiva;ultimate=a_sal_pesada · ramo Precisão |
| Arqueiro | 50 | 128 | 0 | +27% · skill1=a_per_pesada;skill2=a_cil_explosiva;ultimate=a_sal_pesada · ramo Precisão |
| Clérigo | 30 | 64 | 0 | +38% · skill3=c_jul_sagrado · ramo Luz |
| Clérigo | 40 | 256 | 0 | +38% · skill3=c_jul_sagrado · ramo Luz |
| Clérigo | 50 | 256 | 0 | +38% · skill3=c_jul_sagrado · ramo Luz |

## Outliers de outras métricas (contagem; limite igual ao do dps)

| Métrica | Builds fora da faixa |
|---|---:|
| burst | 1464 |
| hpEf | 1764 |
| cura | 592 |
| ttk | 1152 |

## Classe fora do papel

Nenhuma classe fora de 30% da mediana do próprio papel onde há par para comparar.
- Guerreiro: sem par no papel (métrica `hpEf`): não há mediana de comparação.
- Clérigo: sem par no papel (métrica `cura`): não há mediana de comparação.

## Como ler

- Outlier não é erro automático: é o ponto para olhar. O teste `packages/server/test/simulacao.unit.ts` trava um teto (configurável lá) para o que passar disso.
- Os números são medidos sobre a janela de 30 s e o alvo de referência; comparam builds entre si, não são previsão de combate real.

