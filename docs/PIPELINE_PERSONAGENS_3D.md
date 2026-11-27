# Pipeline de personagens 3D (paper-doll pré-renderizado)

Estado em **27/11/2026**. Este documento registra decisões, ferramentas, arquivos e o que falta, para continuar exatamente daqui.

## 1. Decisões tomadas

| Tema | Decisão |
|---|---|
| Técnica | **3D pré-renderizado** (como Diablo 2 / Albion): o personagem é modelado e animado no Blender e renderizado como sprite 2D. Aprovado pelo usuário. |
| Estilo | Simples, estilo Albion; foco na jogabilidade. Corpo **natural** (anatomia humana), não formas geométricas. |
| Câmera | Ortográfica, inclinada a **45°** (casa com o chão 64 x 46 do jogo, PR #205). |
| Sprite | Quadro **128 x 128 px**, até **32 cores**, sem dithering, pés em **(64, 104)**; o jogo desenha em escala 0,5 (PR #209). |
| "O personagem é o que veste" | Cada peça equipada aparece no boneco (arma, mão secundária, armadura, elmo, botas, capa), em **camadas** empilhadas pelo jogo. |
| Início | O personagem **nasce só com a roupa de baixo**, sem arma nem escudo, num **tutorial isolado** dos outros jogadores. |
| Classes | **Mantidas** (Guerreiro, Arqueiro, Clérigo, Mago escolhidos na criação). Só o visual e o início mudam. |
| Raridade | **Mesmo modelo por família**; as partes de "acento" ganham a cor da raridade (épico em diante com brilho). Ver a proposta da seção 7.1. |

## 2. O que foi tentado e descartado (para não repetir)

1. **Frames gerados por código a partir da imagem 2D** (deslocar/entortar pixels da base): espada deformava, pernas quase não mexiam. Uma imagem sem camadas não se anima por partes.
2. **ComfyUI (SD 1.5 + ControlNet OpenPose + LoRA de pixel art)** frame a frame a partir da base: perdeu a identidade do personagem (sumiu a espada, faixa vermelha no visor, armadura esverdeada) e as pernas mal seguiram a pose. Serve para conceito, não para animar.
3. **Rig 2D por partes** (cortar a base em pernas/espada/capa/corpo e girar): consistente, mas o resultado foi reprovado.
4. **Kimodo / kimodo.cpp** (texto -> movimento 3D): repositório confiável (LocalAI, Apache-2.0), mas só gera movimento de esqueleto, não imagens; exigiria compilador C++, CMake, Ninja, Vulkan SDK, Go e ~9 GB de pesos. Não instalado. Pode servir no futuro para gerar movimentos, já que o esqueleto é o mesmo tipo.
5. **Personagem 3D feito de cilindros e esferas** (`personagem_3d.py`, primeira versão): funcionou, mas parecia boneco articulado de madeira. O usuário escolheu o corpo natural.

## 3. Ferramentas instaladas

| Ferramenta | Onde | Observação |
|---|---|---|
| Blender 5.3 | `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe` | Já existia na máquina. Usado em modo linha de comando (`-b`). |
| MPFB 2.0.18 (MakeHuman para Blender) | extensão do Blender: `C:\Users\Otavio Henrique\AppData\Roaming\Blender Foundation\Blender\5.3\extensions\user_default\mpfb` | Baixada de extensions.blender.org, SHA-256 conferido (`c075b3e9…2a2dad`). Licença GPL-3.0 (só do programa). |
| MakeHuman system assets (CC0) | dados do MPFB: `...\Blender\5.3\extensions\.user\user_default\mpfb\data` (cabelos, olhos, peles, roupas) | `makehuman_system_assets_cc0.zip`, 281 MB, de files.makehumancommunity.org. **CC0** (uso comercial livre). Ocupa ~300 MB no disco C:. |
| Aseprite | `E:\Programas\Aseprite v1.3.18.2 (x64) [FileCR]` | **Não usado**: cópia de origem não confiável (FileCR). Se precisar, usar a versão oficial (Steam/site, ou compilar o código do GitHub). As folhas de sprite são geradas pelos scripts no mesmo formato json-array do Aseprite. |

## 4. Onde estão os arquivos

- **Scripts oficiais (versionados):** `tools/arte3d/` neste repositório.
  - `personagem_mh.py`: corpo MakeHuman, roupa de baixo, cabelo, Couraça, Espada de Uma Mão, poses (idle, walk), câmera 45° e render em camadas.
  - `pos_camadas.py`: 512 px -> 128 px, paleta por camada, contorno, camada de acento, folhas + JSON e prévias (sem equipamento / comum / épico).
- **Pasta de trabalho (renders e saídas):** estava em `E:\spriteFrixeP_Arte\`; o usuário está movendo para o **pendrive `F:\spriteFrixeP_Arte\`** (o disco E: está com problemas). Conteúdo:
  - `personagem_mh\`: versão atual (`render\` = 512 px por camada, `sprites\` = folhas 128 px + JSON + prévias GIF, `personagem_mh.blend`).
  - `personagem\` e `guerreiro\`: versões anteriores (cilindros), só referência.
  - `downloads\`: os zips do MPFB e dos assets (podem ser apagados depois de instalados).
- **`D:\...\Desktop\FrixeP_Arte\`** (ComfyUI, modelos SD ~5 GB, resultados antigos): **não é usado** pelo pipeline 3D; pode ser apagado para liberar o disco D:. Se quiser guardar algo, só `resultados\` (frames antigos de referência).

## 5. Como gerar (passo a passo)

No PowerShell, a partir da pasta onde a saída deve ficar (ex.: `F:\spriteFrixeP_Arte\personagem_mh`):

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b -P "E:\Projetos_Dev\FrixeP\tools\arte3d\personagem_mh.py" -- --saida "F:\spriteFrixeP_Arte\personagem_mh\render" --anims idle,walk --dirs se,ne --salvar-blend
```

```powershell
python "E:\Projetos_Dev\FrixeP\tools\arte3d\pos_camadas.py" "F:\spriteFrixeP_Arte\personagem_mh\render" "F:\spriteFrixeP_Arte\personagem_mh\sprites"
```

- Tempo: ~100 imagens (2 direções x 10 frames x 5 camadas), cerca de 10 a 15 minutos.
- `--dirs` aceita `se, ne, s, e, n, sw, w, nw`. O jogo desenha SE e NE e espelha SW e NW (no marco M8 entram as 8).
- `--salvar-blend` grava o `.blend` ao lado do script (abrir no Blender para conferir à mão).

## 6. Como funciona

- **Corpo:** `HumanService.create_human` do MPFB com macros `gender 1.0, age 0.45, muscle 0.9, weight 0.62, proportions 0.85, height 0.72`; esqueleto `game_engine` (53 ossos, padrão de jogos); cabelo `short02` do pacote CC0; pele com material simples (sem SSS).
- **Roupa de baixo:** faixa do quadril copiada do próprio corpo e inflada (deforma junto).
- **Couraça:** "casca" do próprio corpo: copia as faces do tronco (escolhidas pelo osso que mais as move), infla ~3 cm e dá espessura. Peitoral, ombreiras e faldas; frisos em material de acento.
- **Espada de Uma Mão:** a mão direita fecha em punho; a espada é montada num referencial da própria mão e presa ao osso `hand_r` (acompanha o pulso). Pomo, cabo, guarda, lâmina, sulco e ponta; guarda, pomo e sulco são acento.
- **Poses:** rotações em torno de eixos do mundo (independe do eixo de cada osso). Walk de 6 frames (contato D, apoio D, D atrás, contato E, apoio E, E atrás), idle de 4 (respiração).
- **Camadas:** `corpo`, `couraca`, `couraca_acento`, `espada`, `espada_acento`. Cada peça é renderizada com o corpo como *holdout* (o que o corpo esconde sai recortado). O jogo empilha: corpo -> couraça -> acento tingido -> espada -> acento tingido.
- **Acento / raridade:** a camada `*_acento` sai branca; o jogo multiplica pela cor da raridade (`RARITY_COLOR`); épico em diante ganha brilho.
- **Pós-processo:** mesma escala e deslocamento para todas as camadas (medidos no corpo idle SE; personagem ~96 px de altura); paleta por camada (corpo 12, couraça 9, espada 5 + contorno + acento = 27 cores); contorno escuro de 1 px.

## 7. Pendências (onde paramos)

### 7.1 Visual da espada por raridade (decisão pendente do usuário)
O usuário mandou os ícones de referência:
- **Comum:** lâmina de ferro clara, guarda reta, cabo de couro marrom, pomo redondo escuro. O modelo atual já segue isso.
- **Épica (roxa):** lâmina **escura** com **runas roxas brilhando** ao longo do sulco, guarda ornamentada com **orbe** e pontas, pomo em losango, partículas roxas.

Só tingir o acento não chega à épica: ela muda o material da lâmina (escura) e a forma da guarda. **Proposta:** 2 versões por família em vez de 8, com a cor da raridade por cima:
- **"Ferro"** (Lixo a Raro): o modelo atual.
- **"Abissal"** (Épico a Ancestral): lâmina escura, runas no sulco (acento que brilha), guarda com orbe.

Falta o "sim" do usuário.

### 7.2 Pegada da espada ao andar (corrigido no script, falta renderizar e conferir)
O personagem segurava a espada atravessada de lado. Em `tools/arte3d/personagem_mh.py` a lâmina passou a apontar para a frente (sentido da caminhada), para baixo e levemente para fora: `lamina_dir = (-0.10, -0.62, -0.78)`.

### 7.3 Braço atravessando a couraça no idle (corrigido no script, falta renderizar e conferir)
O braço direito em repouso ficava dentro da armadura, que é ~3 cm maior que o corpo. Os braços passaram de 48° para **40°** de abaixamento (`base_parada`), afastando-se do tronco. Se ainda encostar, reduzir o `infla` do peitoral (0.028) ou abrir mais o braço (36°).

### 7.4 Ajustes finos
- Braço esquerdo (sem arma) balança para trás um pouco exagerado em alguns frames do walk.
- Postura levemente curvada para a frente (`spine_02` com -3° no `pose()`).

## 8. Próximas fases
1. **Fase 1 (atual):** corpo base + Couraça + Espada de Uma Mão, idle e walk, SE e NE. Resolver a seção 7.
2. **Fase 2:** o cliente (`packages/client/src/sprites.ts`, `ActorView`) passa a empilhar as camadas por slot equipado, com a cor da raridade no acento. O servidor envia o visual de cada slot (hoje só `weaponRarity`).
3. **Fase 3:** nascer sem equipamento + tutorial isolado; a criação mostra o boneco de roupa de baixo.
4. **Fase 4:** demais famílias (armas e mãos secundárias das 4 classes, elmos, botas, capas) e animações (ataque, habilidades, esquiva, golpe recebido, morte), nas 8 direções.

## 9. Relacionado
- Jogo: PR #205 (câmera 45°, chão 64 x 46, `packages/client/src/iso.ts`), PR #209 (quadros 128 x 128), PR #206 (raridades Lixo e Ancestral). Todos na `dev`; entram na produção no próximo update.
- `docs/ART_GUIDE.md` e `docs/DIRECAO_ARTE.md`: especificações de sprite.
