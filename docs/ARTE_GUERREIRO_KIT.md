# Kit de arte do Guerreiro: duas mãos e espada + escudo

Referência do usuário: [assets/source/warrior_ref_2h.jpg](../assets/source/warrior_ref_2h.jpg) (frente e costas, espada de duas mãos).
Este documento transforma a referência em um kit de produção. Regras gerais continuam em [ART_GUIDE.md](ART_GUIDE.md).

Status honesto: os atlas em `assets/characters/` são **placeholder gerado por código** (`tools/gen_warrior_kit.py`).
Servem para validar o formato, a paleta e a silhueta. A arte final é desenhada à mão pelo dev de arte.

---

## 1. Auditoria: como o guerreiro é desenhado hoje

| Item | Situação atual |
|---|---|
| Fonte da arte final | `assets/characters/` está **vazio** (só `.gitkeep`). |
| Corpo provisório em uso | `assets/placeholder/warrior.png` + `warrior.json`, gerado por `tools/gen_heroes.py` e `tools/gen_placeholder_bodies.py`. |
| Quem escolhe o atlas | `packages/client/src/main.ts` (~linha 796): usa `assets/characters/<classe>` se existir, senão o placeholder. |
| Carregador | `packages/client/src/sprites.ts` e `sprites-core.ts`: lê o JSON json-array do Aseprite, tags `<animacao>_<direcao>`. Se o atlas faltar ou for inválido, o jogo desenha **círculo** no lugar. |
| Direções | SE e NE desenhadas; SW e NW espelhadas por código (`pickDirection`). |
| Pivô | (32, 52) no quadro 64 x 64 (`PIVOT_X`, `PIVOT_Y`). |
| Habilidades no cliente | Não há animação por habilidade. Q (Investida), W (Correntes), E (Escudo Refletor) e R (Queda do Colosso) usam a animação **`skill`**; sem ela, cai em `attack`. |

### Animações que o jogo usa hoje (guerreiro)

| Animação | Quando o jogo toca | Frames no placeholder atual |
|---|---|---|
| `idle` | parado | 4 |
| `walk` | andando | 6 |
| `attack` | Golpe (ESPAÇO) | 5 |
| `skill` | Q, W, E e R | 5 |
| `dodge` | esquiva | 3 |
| `hit` | tomar dano | 2 |
| `death` | morte | 5 |

Duração por quadro (ms), igual ao placeholder: idle 167, walk 100, attack 83, skill 83, dodge 83, hit 83, death 125.

---

## 2. Variações do equipamento

| Variação | Arma | Escudo | Nome do atlas | Descrição |
|---|---|---|---|---|
| **A** | Espada de duas mãos (montante/espada larga) | não | `warrior_2h` | Na referência: lâmina diagonal para cima à frente; de costas, bainha em X nas costas. |
| **B** | Espada de uma mão | sim (de aço com emblema vermelho) | `warrior_1h` | Escudo no braço de trás (visto de costas, fica atrás do corpo). |

Itens do jogo ligados a isso: `espada_larga`, `montante`, `lamina_runica` (duas mãos) e `espada_1m` + `escudo_guerra` (uma mão + escudo), em `packages/shared/src/items.ts`.

---

## 3. Paleta

Valores escolhidos a partir da referência (a leitura por amostra de pixel ficou ruidosa, então os tons foram ajustados à mão). Todos são constantes em `tools/gen_warrior_kit.py`.

| Papel | Hex | Uso |
|---|---|---|
| Contorno | `#0E0810` | silhueta, sempre |
| Aço escuro | `#4A5260` | sombra do elmo, cinto |
| Aço | `#84909E` | elmo, escudo |
| Aço claro | `#C4CED8` | reflexo, fivela |
| Vermelho escuro | `#5A1426` | sombra da crista |
| Vermelho | `#972A45` | crista, faixa da cintura, emblema |
| Cota (sombra) | `#38344B` | malha, fundo do xadrez |
| Cota (base) | `#4F4C67` | malha |
| Cota (luz) | `#7C7892` | malha (realce) |
| Capa escura | `#1B1328` | capa, gola |
| Capa (luz) | `#34283F` | vincos da capa |
| Calça cinza | `#857A82` / `#605862` | calça (base / sombra) |
| Bandagem | `#C8C0C8` | faixas nas pernas |
| Couro | `#5B4330` | cinto, bainha, bolsa |
| Couro escuro | `#34261E` | sombra do couro |
| Bota | `#6E4A32` | botas |
| Pele | `#DEA080` / `#B07460` | rosto e mãos (base / sombra) |
| Lâmina | `#E6ECF6` / `#96A2B8` | lâmina (luz / sombra) |
| Brasa (habilidade) | `#FF8C3C` | anel de brilho ao usar habilidade |

Regra do projeto: sem iluminação pintada no sprite. Dia e noite são feitos por código, então o desenho usa só sombra de cor (já no contorno e nos tons acima).

---

## 4. Peças visuais (lista para o artista)

Cada peça precisa aparecer nas duas variações, exceto onde marcado.

| Peça | Frente (SE) | Costas (NE) | Obs. |
|---|---|---|---|
| Elmo de aço | sim, com viseira e rosto | casco liso, sem rosto | silhueta da cabeça |
| Crista vermelha | sim | sim | no topo, em arco |
| Gola / capuz escuro | sim | sim | fica sob o elmo |
| Cota de malha | torso e antebraços | torso | textura em xadrez |
| Capa escura, rasgada | atrás, cai até a canela | cobre as costas | barra irregular |
| Faixa vermelha | pendurada na frente | na cintura, atrás | |
| Cinto + bolsa de couro | sim | sim | |
| Calça + bandagens | sim | sim | faixas nas pernas |
| Botas de couro | sim | sim | |
| Espada de 2 mãos | nas mãos, diagonal para cima | **bainha em X nas costas** | variação A |
| Espada de 1 mão | na mão da frente | na mão da frente | variação B |
| Escudo de aço | não | **atrás do corpo** | variação B |

---

## 5. Tabela de produção: animação x variação x quadros

Quadro: **64 x 64 px**, pivô (32, 52). Direções desenhadas: **SE** e **NE** (SW e NW são espelhados pelo jogo).
Cada linha abaixo vale para as duas variações: `2h` e `1h`.

| Animação | Quadros | SE (frente) | NE (costas) | Ideia do movimento |
|---|---|---|---|---|
| `idle` | 4 | sim | sim | respiração e leve balanço |
| `walk` | 6 | sim | sim | passada; a espada acompanha o corpo |
| `attack` | 5 | sim | sim | golpe de cima para baixo; impacto no quadro 2–3 |
| `skill` | 5 | sim | sim | arma sobre a cabeça, brasa; a mesma animação serve a Q, W, E e R |
| `dodge` | 3 | sim | sim | desvio lateral, joelhos dobrados |
| `hit` | 2 | sim | sim | recuo; quadro 1 com clarão branco |
| `death` | 5 | sim | sim | tomba em torno dos pés (gira até 90 graus) |

Total: **7 animações x 2 direções x 2 variações = 28 tags**, com **60 quadros por variação**.

### Nomes de arquivo

- Quadros soltos (para exportar do Aseprite): `warrior_<variacao>_<anim>_<dir>_<nn>.png`
  - Exemplos: `warrior_2h_walk_se_00.png`, `warrior_1h_skill_ne_03.png`.
- Atlas final (o que o jogo carrega): `warrior_2h.png` + `warrior_2h.json` e `warrior_1h.png` + `warrior_1h.json`.
- Tudo em minúsculas, com sublinhado, sem acento e sem espaço.
- Dentro do atlas, cada tag é `<anim>_<dir>` (ex.: `walk_se`). O jogo lê essa convenção em `sprites-core.ts`.

### Formato técnico

- PNG RGBA com transparência.
- Atlas único por variação, com uma linha por tag e até 6 quadros por linha: 448 x 896 px (limite do projeto: 2048 x 2048).
- JSON no formato **json-array** do Aseprite/Phaser, com `meta.frameTags` (exportar com `--format json-array` e `--list-tags`).

---

## 6. Como o dev de arte refaz à mão

1. Abrir a referência e o `warrior_2h.png` (ampliado) lado a lado no Aseprite.
2. Usar os tons da seção 3 como paleta base; não pintar luz no sprite.
3. Desenhar primeiro o **idle_se** das duas variações (é a base da silhueta). Depois copiar a pose para os demais quadros.
4. Manter o pivô nos pés (32, 52) e a silhueta dentro de 64 x 64.
5. Exportar em `assets/characters/` como `warrior_2h.png/.json` e `warrior_1h.png/.json` (no mesmo formato do placeholder).
6. Conferir o contorno escuro em todas as tags, sobretudo na capa e na espada de costas.

---

## 7. Integração (ainda NÃO feita)

Nada no cliente carrega estes arquivos. O jogo continua com `assets/placeholder/warrior.*`.
Para ligar a variação escolhida pelo jogador, falta:

1. Escolher o atlas pelo equipamento equipado (`hands` do item na mão principal; `escudo_guerra` na secundária). Hoje o cliente só conhece a classe.
2. Pedir a animação `skill` para Q, W, E e R (já é o comportamento atual) ou criar `skill1..3`/`ultimate` se o artista desenhar cada uma.
3. Trocar a chave do atlas em `packages/client/src/main.ts` (~linha 796) pela variação.

Esta mudança mexe na lógica do cliente e fica para um PR próprio.

---

## 8. O que é placeholder e o que precisa de arte

| Item | Estado |
|---|---|
| Referência copiada e documentada | pronto |
| Lista de peças, paleta e tabela de animações | pronto |
| Gerador `tools/gen_warrior_kit.py` | pronto; roda com Python + Pillow |
| Atlas `warrior_2h` e `warrior_1h` (PNG + JSON) | **placeholder**: silhueta correta, traço simples, sem detalhe de malha e sem rosto nas costas |
| Animações de habilidade por tipo (`skill1..3`, `ultimate`) | não geradas; só `skill` |
| Integração no cliente | não feita |
| Arte final de todas as tags | a fazer pelo dev de arte |
