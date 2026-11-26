# FrixeP: direção de arte

Guia único de arte do FrixeP. Junta o que o jogo já usa com as decisões tomadas sobre a arte pendente (`Documentação Oficial/ARTE_PENDENTE.pdf`). Regras técnicas de grid, formatos e entrega continuam em [ART_GUIDE.md](ART_GUIDE.md); os prompts completos de geração ficam no PDF.

Este documento vale para toda arte nova. Quando ele e outro doc divergirem, este vence e o outro deve ser corrigido.

## 1. Referências e clima

- **Clima:** fantasia sombria. Mundo frio e úmido (cinza, ardósia, azul-noite), com **brasa quente** como destaque: fogueiras, janelas, tochas, olhos e magias.
- **Inspiração de interface e ícones:** Albion Online (ícones de item com moldura de cor, fundo escuro, objeto central grande).
- **Leitura:** a arte tem que ser legível em tela pequena (celular) e em 48 x 48 px.
- **Dia e noite** são feitos por código (tint e luzes). Sprites **não** têm luz pintada nem brilho de ambiente.

## 2. Paleta

### 2.1 Base do mundo (cenário e personagens)

| Uso | Hex |
|---|---|
| Sombra profunda | `#0c121c` |
| Ardósia escura | `#161f2e` |
| Pedra fria | `#22304a` |
| Névoa / gelo claro | `#8fb0cf` |
| Destaque quente (brasa) | `#ff9a4d` |
| Brasa intensa | `#ffb072` |

Regra: fundos frios, destaque quente. Cada zona usa de 16 a 32 cores (ART_GUIDE, seção 1).

### 2.2 Interface (HUD, janelas, botões)

| Uso | Hex |
|---|---|
| Fundo de painel | `#0c121c` a `#161f2e` (azul-escuro) |
| Borda de painel | `#c9a45c` (dourado) |
| Título e destaque de janela | `#ffb072` (laranja-brasa) |
| Texto principal | `#e6eef9` |
| Texto secundário | `#8fb0cf` |
| Foco de teclado | `#ffd2a3` |

Fonte: **Cinzel** para títulos e rótulos; Georgia para texto corrido.

### 2.3 Ícones de item

Fundo fixo `#12121a` (sem cenário, sem sombra no fundo). A cor de cada raridade aparece na moldura.

## 3. Raridades (8)

As cores e os sufixos já estão no código (`packages/shared/src/items.ts`). **Decisão: manter as cores do código.** O PDF só difere em hex pequenos (Lixo, Lendário, Ancestral); não vale trocar o código por isso.

| # | Raridade | Nome no código | Sufixo | Moldura (hex) | Acabamento |
|---|---|---|---|---|---|
| 1 | Lixo | `junk` | Quebrado | `#8a8f98` | Quebrado, enferrujado, fosco; sem brilho mágico |
| 2 | Comum | `common` | Simples | `#f2f2f2` | Materiais limpos, sem ornamento, sem brilho |
| 3 | Incomum | `uncommon` | de Ferro | `#5fd17a` | Poucos detalhes verdes, gravação leve |
| 4 | Raro | `rare` | da Geada | `#2f8bff` | Inlay de metal ou cristal azul, brilho frio |
| 5 | Épico | `epic` | Solar | `#a855f7` | Roxo encantado, runas gravadas, luz roxa dentro da moldura |
| 6 | Lendário | `legendary` | Carmesim | `#ff9d2e` | Borda dourada-laranja fundida, gravação rica, um ponto focal com brilho |
| 7 | Mítico | `mythic` | do Abismo | `#ff2e63` | Veios carmim e rosa-choque, soquetes brilhando, brilho intenso mas contido |
| 8 | Ancestral | `ancestral` | (sem sufixo) | `#2de2e6` | Metal turquesa antigo, símbolos gravados, soquetes, brilho ciano; o mais ornamentado |

Regras:
- O nome aparece como **sufixo** do item (ex.: "Besta Carmesim"). Ancestral não tem sufixo.
- O **Épico é roxo** e fica assim. Não há mais dourado como Épico; o dourado-laranja é do Lendário.
- Brilho e efeito ficam **dentro** da moldura. Nada vaza para fora do ícone.
- Não criar um tier novo de cor fora desta tabela.

## 4. Regras por tipo de arte

### 4.1 Ícones de item (`assets/items/`)
- **Mestre:** 512 x 512 px. **No jogo:** 48 x 48 px. Ícone quadrado 1:1.
- Fundo `#12121a`, uniforme, sem gradiente, sem chão, sem sombra no fundo.
- Um objeto só, centralizado, ocupando cerca de 80% do quadrado.
- Moldura arredondada, cerca de 4 px de espessura, a cerca de 16 px das bordas, na cor da raridade.
- Sem texto, sem números, sem algarismos romanos.
- Luz só como sombreamento do material; sem brilho pintado fora do objeto.
- Lixo tem ícone próprio (mesmas 36 famílias, acabamento quebrado).
- Poção de Vida: 1 arte, sem raridade própria.
- Estilo base de cada item (inglês, usado nos prompts): `Game item icon, pixel-art style, Albion Online inspired...` (bloco completo no PDF).

### 4.2 Personagens (4 classes)
- Quadro de **64 x 64 px**, PNG transparente, ponto dos pés no centro inferior.
- **4 diagonais:** desenhar SE e NE; o jogo espelha SW e NW. As 8 direções entram no marco M8 (`docs/GUIA_ARTE_INICIAL.pdf`).
- Animações: `idle` 4 · `walk` 6 · `attack` 6 · `skill1` a `skill3` 6–8 · `dodge` 4 · `hit` 2 · `death` 6.
- Equipamento em camadas separadas (corpo, armadura, arma, capa, aura), no mesmo grid de quadros.
- Silhueta reconhecível de cada classe: Guerreiro (placa e escudo), Arqueiro (couro e capuz), Clérigo (vestes claras com sol), Mago (túnica e chapéu com runa).

### 4.3 Monstros (6)
- Comuns (Esqueleto, Lobo Gélido, Espectro): quadro **64 x 64** ou **128 x 128**.
- Chefes (Rei Ossudo, Lobo Alfa, Soberano das Catacumbas): quadro **128 x 128** ou **192 x 192**.
- Animações: `idle`, `walk`, `attack` (com **frame de telégrafo** visível), `hit`, `death`.
- O telégrafo é obrigatório: o combate depende dele.

### 4.4 NPCs (3)
- Ferreiro (`npc_smith`), Mercador (`npc_merchant`), Leiloeiro (`npc_auctioneer`).
- Substituem os provisórios de `assets/placeholder/` com o mesmo quadro de personagem (64 x 64), em pé e parado.

### 4.5 Cenário e tiles
- **4 zonas:** Cinzas (ash), Floresta Gélida (frost), Catacumbas (crypt), Cidade de Brasalume (town).
- Cada zona: **3 a 4 variações de chão** e transições de borda.
- Tile isométrico **64 x 32 px** (losango 2:1). Mapas de 40 x 40 a 48 x 48 tiles.
- Cada zona tem paleta própria dentro da base da seção 2.1. Cinzas começa primeiro (fria, cinza, brasa de fogueira).
- Decoração (árvores, pedras, ruínas) ainda não está no código. Quando entrar, objeto alto tem origem na base.

### 4.6 Props
- Portal ou portão: um modelo, estados **ativo** e **inativo**.
- Baú do chefe (drop), cofre da cidade, fogueira, mural: cada um com estado inativo e ativo quando couber.
- Murais e ruínas contam história só com imagem, sem texto longo.

### 4.7 Efeitos (FX): 19 conjuntos
- Spritesheets curtos, fundo transparente.
- Projéteis (5): flecha, perfurar, virote, fogo, arcano.
- Habilidades (7): correntes, queda do colosso, chuva de flechas, julgamento, relâmpago, chuva de fogo, meteoro.
- Cura (2): cura em área, cura focada (raio).
- Cilada (3): armar, disparar, sumir.
- Genéricos (2): impacto e morte.
- Brilho de raridade: fica no efeito, não no sprite do personagem.

### 4.8 UI
- Botões de habilidade: área de toque de pelo menos **48 x 48 px**.
- Habilidades (22) já prontas em `assets/ui/skills/`; não redesenhar.
- Recursos (fúria, foco, mana): hoje o código só define os nomes (flame, eye, drop). A arte nova é desenhada como ícone 24 ou 32 px no estilo de habilidade.
- Moedas (3) em `assets/items/`: já existem; o código de moeda ainda não as usa, então entram quando o uso chegar.
- Ícones do app e favicon: já em `packages/client/public/`; não mexer agora.

## 5. Nomes de arquivo e tamanhos

| Tipo | Caminho | Nome | Tamanho |
|---|---|---|---|
| Ícone de item | `assets/items/` | `item_<família>_<raridade>.png` (ex.: `item_besta_epic.png`) | 48 x 48 (mestre 512) |
| Poção de Vida | `assets/items/` | `item_pocao_vida.png` | 48 x 48 |
| Personagem | `assets/characters/` | `warrior_walk_se_00.png` | 64 x 64 |
| Monstro | `assets/monsters/` | `skeleton_attack_se_00.png` | 64 x 64 ou maior |
| Tile | `assets/tiles/` | `tile_cinzas_grama_01.png` | 64 x 32 |
| Efeito | `assets/fx/` | `fx_hit_slash_00.png` | conforme o efeito |

- Minúsculas, sublinhado, sem acento e sem espaço.
- Família em português sem acento (`espada_larga`, `lamina_runica`, `cajado_arcano`). Raridade em inglês, igual ao código (`junk`, `common`, `uncommon`, `rare`, `epic`, `legendary`, `mythic`, `ancestral`).
- Itens antigos (`espada_enferrujada`, `gibao_surrado` e outros) são só para migração e podem sair depois.

## 6. Entrega
- Editáveis em `assets/source/` (`.aseprite` ou equivalente). Finais em `assets/<categoria>/`.
- PNG com transparência + JSON de atlas no formato Phaser. Atlas de até **2048 x 2048 px**.
- `.psd`, `.aseprite`, `.kra`, `.tif`, `.wav` e os PNG de `assets/` ficam no Git LFS.
- Arte gerada por IA entra em `assets/CREDITS.md` com fonte e licença.

## 7. O que NÃO fazer
- Não pintar luz, brilho de ambiente ou sombra de chão no sprite. Dia e noite são do código.
- Não usar fundo colorido, cenário ou mesa atrás de um ícone de item.
- Não usar texto, número ou algarismo romano dentro do ícone.
- Não deixar brilho de raridade vazar para fora da moldura do ícone.
- Não trocar o dourado da moldura de interface pelo roxo (roxo é só Épico).
- Não criar cor de raridade fora da tabela da seção 3.
- Não desenhar as 8 direções antes do marco M8.
- Não produzir em volume antes de aprovar **um personagem + um tile + um efeito** no jogo (regra de ouro).
- Não usar arte de terceiros ou gerada por IA sem registro em `assets/CREDITS.md`.

## 8. Fila de produção

Ordem decidida. Cada etapa só começa depois de aprovada no jogo.

1. **Validar o estilo:** Guerreiro completo (4 diagonais, todas as animações) + 1 monstro (Esqueleto, com telégrafo) + chão da Cinzas (3 a 4 variações) + efeito de hit (`fx_hit_slash`).
2. **Ícones de item piloto:** 1 família (Espada de Uma Mão) nas 8 raridades, com o padrão da seção 4.1. Valida moldura, leitura em 48 px e as cores.
3. **Próximas classes:** Arqueiro, Clérigo, Mago (4 diagonais e animações da seção 4.2).
4. **Ícones de item completos:** 36 famílias x 8 raridades, por classe (Guerreiro, depois Arqueiro, Clérigo, Mago).
5. **Zonas:** Floresta Gélida e Catacumbas (chão e props), depois Brasalume (cidade).
6. **Monstros restantes:** Lobo Gélido, Espectro; depois chefes (Rei Ossudo, Lobo Alfa, Soberano das Catacumbas).
7. **NPCs:** Ferreiro, Mercador, Leiloeiro, trocando os provisórios.
8. **Efeitos restantes:** 19 conjuntos de FX.
9. **Acabamento:** camadas emissivas de dia e noite, clima, cosméticos raros.

## 9. Em aberto

Estas decisões ficam para depois, sem bloquear a fila acima:

- **Efeitos de Lendário, Mítico e Ancestral:** o PDF propõe brilho focal, soquetes e símbolos; falta desenhar a versão exata e testar no jogo. Decidir quando chegar à etapa 4.
- **Mapa de migração** dos itens antigos (`espada_enferrujada` etc.) para as novas famílias.
- **Decoração de cenário** (árvores, pedras, ruínas): não definida no código.
- **Cosméticos:** `assets/cosmetics/` está vazia e não há código para eles.
- **Moedas:** arte pronta, uso no código ainda não existe.
