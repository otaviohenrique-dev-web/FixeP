# FrixeP: guia de arte (v1, desenvolvimento solo)

O projeto é desenvolvido por uma pessoa só: a mesma pessoa cria a arte, o código e o deploy.
Este guia reúne as regras técnicas que a arte precisa seguir para rodar bem em navegador desktop e mobile, sem retrabalho no código.

Os valores abaixo são o padrão adotado. Mudar o tamanho do tile exige mexer no cliente (`TILE_W`/`TILE_H` em `packages/client/src/main.ts`).

## 1. Estilo
- Dark fantasy em pixel art (ou pixel art de alta resolução). Decidir o estilo **antes** de produzir em volume.
- Paleta limitada por zona (16–32 cores), com uma cor de destaque quente (brasa, laranja) contra fundos frios.
- Sem iluminação "assada" no sprite: dia e noite são feitos por código (tint e luzes). Fogueiras, janelas e olhos brilhantes vão em **camadas emissivas separadas**.

## 2. Projeção e grid
- Tile do chão: **64 x 46 px** (losango; câmera inclinada a ~45°, estilo Albion, desde 27/11/2026; antes 64 x 32). A altura dos objetos conta a partir do centro da base do tile. Medidas no código: `packages/client/src/iso.ts`.
- Mapas: as zonas têm entre 40 x 40 e 48 x 48 tiles (a simulação é ortogonal no servidor; o isométrico é só visual).
- Objetos altos (árvores, paredes, pilares) têm **origem na base**: o ponto de ancoragem é o centro inferior do tile que ocupam.

## 3. Personagens e monstros
- Quadro de **128 x 128 px** para personagens humanoides, com até **32 cores** e **sem dithering** (padrão desde 27/11/2026). O jogo desenha o quadro de 128 em escala 0,5: no mundo ele ocupa o mesmo espaço do antigo 64 x 64 e ganha detalhe quando a câmera aproxima. Ponto dos pés na mesma proporção: (64, 104) no quadro de 128. Deixe 8 a 12 px de folga acima da cabeça para ataques. Arte antiga em 64 x 64 continua aceita; cada atlas usa um tamanho só. Atlas de 2048 x 2048 cabe 16 x 16 quadros de 128.
- **Direções:** começar com 4 diagonais. Desenhar SE e NE; o jogo espelha SW e NW. As 8 direções completas entram depois, no marco M8 de `docs/GUIA_ARTE_INICIAL.pdf`.
- Animações mínimas por classe (Guerreiro, Arqueiro, Clérigo, Mago): `idle` (4 frames), `walk` (6), `attack` (6), `skill1..3` (6–8), `dodge` (4), `hit` (2), `death` (6).
- Monstros: `idle`, `walk`, `attack` (com frame de **telégrafo** visível, pois o combate depende disso), `hit`, `death`.
- Equipamento e cosméticos em **camadas separadas** (corpo, armadura, arma, capa, aura), alinhadas ao mesmo grid de quadros, para trocar cosméticos sem refazer o corpo.

## 4. Cenário
- Tilesets por zona. Hoje o chão é desenhado por código (cores por tema); a arte de cenário entra por zona, começando pela Cinzas.
- Variações de chão (3 a 4 por tipo) para quebrar repetição, mais transições de borda.
- Props interativos (fogueira, baú, mural) com estado "inativo" e "ativo".
- Ambientes contam história só com imagem: murais e ruínas não usam texto longo.

## 5. UI, efeitos e cosméticos
- UI legível em tela pequena: botões de habilidade com pelo menos 48 x 48 px de área de toque.
- Efeitos (hit, magia, partículas) como spritesheets curtos, em fundo transparente.
- Cosméticos raros (auras, capas, pets) precisam de silhueta fácil de reconhecer.
- **Ícones de item:** `assets/items/item_<família>_<raridade>.png`, mestre 512 px e 48 x 48 px no jogo. Fundo sólido `#12121a` e moldura arredondada na cor da raridade (ver `docs/DIRECAO_ARTE.md`, seções 2.3 e 3). Sem iluminação pintada no sprite.

## 6. Entrega técnica
- Fonte editável em `assets/source/` (`.aseprite` ou equivalente). Exportados em `assets/<categoria>/`.
- Export: **PNG com transparência** + **JSON de atlas** no formato Phaser (hash ou array). Atlas de no máximo **2048 x 2048 px**.
- Nomes em minúsculas com sublinhado, sem acento e sem espaço: `warrior_walk_se_00.png`, `tile_cinzas_grama_01.png`, `fx_hit_slash_00.png`.
- Tiled (se usado): tilesets em `.tsx`, mapas em `.tmj`, com camadas `chao`, `decoracao`, `colisao`, `objetos`.
- **Git LFS:** `.psd`, `.aseprite`, `.kra`, `.tif`, `.wav` e os PNG de `assets/` ficam no LFS. Rode `git lfs install` uma vez por máquina.
- Assets de terceiros ou gerados por IA devem ser registrados em `assets/CREDITS.md`, com fonte e licença.
- Geradores de arte provisória ficam em `tools/` (ex.: `gen_placeholder_bodies.py`, `gen_npcs.py`, `gen_wolf.py`). Eles reescrevem `assets/placeholder/` e `assets/items/`: rode-os de novo só se quiser refazer esses arquivos.

## 7. Ordem de produção
> Direção geral, paleta, raridades e fila detalhada: ver [DIRECAO_ARTE.md](DIRECAO_ARTE.md). Esta seção é o resumo.
> Personagens e equipamentos são feitos em 3D e pré-renderizados em camadas: ver [PIPELINE_PERSONAGENS_3D.md](PIPELINE_PERSONAGENS_3D.md).

1. **Validar o estilo:** 1 classe (Guerreiro) completa + 1 monstro + chão da Cinzas + efeito de hit; depois 1 família de ícones (Espada de Uma Mão) nas 8 raridades.
2. **Próximas classes e zonas:** Arqueiro e Clérigo, Mago, Floresta Gélida, Catacumbas.
3. **Bosses e cidade:** arte própria do Rei Ossudo, do Soberano das Catacumbas e da cidade de Brasalume.
4. **Acabamento:** dia e noite (camadas emissivas), clima e cosméticos raros.

> Regra de ouro: aprovar **um personagem + um tile + um efeito** no jogo antes de produzir o resto. Corrigir o estilo cedo custa pouco; corrigir depois de 200 sprites custa meses.

## 8. Modelos e marcos
- O plano de marcos (M0 a M8), tempos de animação, tamanhos de efeito e convenção de exportação estão em `docs/GUIA_ARTE_INICIAL.pdf`.
- Modelos (grade do chão 64x46, quadro de personagem 128x128 com o ponto dos pés e paleta inicial) em `assets/source/templates/`.

## 9. Ver a arte no jogo
- O carregador de sprites lê os atlas de `assets/characters/` e `assets/monsters/`. Recarregue o jogo depois de salvar.
- Sem atlas, o personagem aparece como círculo. O console do navegador (F12) explica o motivo quando algo está fora do padrão.
- Como o README descreve em "Arte no jogo", atlas de depuração não são arte do jogo e não vão para o Git.
