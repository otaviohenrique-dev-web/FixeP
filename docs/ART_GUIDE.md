# FrixeP: guia de arte (v0.1, rascunho para alinhar com o artista)

Objetivo: fazer a arte exclusiva rodar bem em navegador desktop e mobile, sem retrabalho de código.
Os valores abaixo são **propostas**. O artista pode ajustar, mas qualquer mudança em tamanho de tile exige mexer no cliente (`TILE_W`/`TILE_H` em `packages/client/src/main.ts`).

## 1. Estilo
- Dark fantasy, pixel art ou pixel art de alta resolução (decidir **primeiro**, antes de produzir em volume).
- Paleta limitada e compartilhada (16–32 cores por zona), com uma cor de destaque quente (brasa, laranja) contra fundos frios.
- Nada de iluminação "assada": o ciclo dia/noite é feito por tint e luzes no código. Fogueiras, janelas e olhos brilhantes vão em **camadas emissivas separadas**.

## 2. Projeção e grid
- Tile isométrico 2:1: **64 x 32 px** (losango). Altura de objetos conta a partir do centro da base do tile.
- Mapa da fase 1: 40 x 40 tiles (a simulação é ortogonal no servidor; o isométrico é só visual).
- Objetos altos (árvores, paredes, pilares) têm **origem na base**: o ponto de ancoragem é o centro inferior do tile que ocupam.

## 3. Personagens e monstros
- Frame de **64 x 64 px** para personagem humanoide (monstros grandes: 128 x 128 ou 192 x 192, avisar antes).
- **8 direções**. Para economizar trabalho: desenhar 5 (S, SE, E, NE, N) e espelhar as outras 3 no código.
- Animações mínimas por classe (Guerreiro, Arqueiro, Clérigo): `idle` (4 frames), `walk` (6), `attack` (6), `skill1..3` (6–8), `dodge` (4), `hit` (2), `death` (6).
- Monstros: `idle`, `walk`, `attack` (com frame de **telégrafo** visível, pois o combate depende disso), `hit`, `death`.
- Equipamento e cosméticos em **camadas separadas** (corpo, armadura, arma, capa, aura) alinhadas ao mesmo grid de frames, para trocar cosméticos sem refazer o corpo.

## 4. Cenário
- Tilesets organizados por zona: Vila Cinzas, Bosque Murcho, Charneca dos Sinos, Cripta do Rei Pálido.
- Variações de chão (3 a 4 por tipo) para quebrar repetição, mais transições de borda.
- Props interativos (fogueira, baú, mural, Eco de lore) com estado "inativo" e "ativo".
- Lore por ambiente: murais e ruínas devem contar história só com imagem, sem texto longo.

## 5. UI, efeitos e cosméticos
- UI legível em tela pequena de celular: botões de skill com pelo menos 48 x 48 px de área de toque.
- Efeitos (hit, magia, partículas) como spritesheets curtos, em fundo transparente.
- Cosméticos raros (auras, capas, pets) são o item viral do jogo: merecem silhueta fácil de reconhecer em clipe de 15 s.

## 6. Entrega técnica
- Fonte editável em `assets/source/` (`.aseprite` ou equivalente). Exportados em `assets/<categoria>/`.
- Export: **PNG com transparência** + **JSON de atlas** no formato Phaser (hash ou array). Sugestão: Aseprite para animar e Free Texture Packer ou TexturePacker para empacotar.
- Atlas de no máximo **2048 x 2048 px** (limite seguro para celulares de entrada). Um atlas por categoria/zona.
- Nomes em minúsculas com sublinhado: `warrior_walk_se_00.png`, `tile_bosque_grama_01.png`, `fx_hit_slash_00.png`.
- Tiled: tilesets em `.tsx`, mapas em `.tmj` (JSON), com camadas `chao`, `decoracao`, `colisao`, `objetos`.
- **Git LFS:** o repositório já guarda `.psd`, `.aseprite`, `.kra`, `.tif`, `.wav` e todos os PNG de `assets/` no LFS. Rode `git lfs install` **uma vez** na sua máquina, antes de clonar.
- Licença: tudo que for criado do zero é da equipe. Qualquer asset de terceiros ou gerado por IA deve ser registrado em `assets/CREDITS.md` com fonte e licença.

## 7. Ordem sugerida de produção (alinhada ao roadmap)
1. **F1:** 1 classe (Guerreiro) completa + 1 monstro + tileset básico da Vila Cinzas + efeito de hit. Valida o estilo.
2. **F2:** Arqueiro e Clérigo, zona Bosque Murcho, ícones de inventário.
3. **F3/F4:** Charneca dos Sinos, Cripta e bosses.
4. **F5/F6:** variações dia/noite (camadas emissivas), clima, cosméticos raros.

> Regra de ouro: aprovar **um personagem + um tile + um efeito** no jogo antes de produzir o resto. Corrigir estilo cedo custa pouco; corrigir depois de 200 sprites custa meses.

## 8. Primeiras entregas e modelos

O plano de entregas iniciais (marcos M0 a M8, tempos de animação, tamanhos dos efeitos e convenção de exportação) está em `docs/GUIA_ARTE_INICIAL.pdf`.
Modelos prontos (grade isométrica 64x32, quadro de personagem 64x64 com o ponto dos pés e paleta inicial) em `assets/source/templates/`.

## 9. Ver a arte dentro do jogo

O carregador de sprites já existe: salve os atlas exportados em `assets/characters/` e `assets/monsters/` e recarregue o jogo (veja o README, seção "Arte no jogo").
Sem atlas, o personagem continua sendo um círculo. Se algo estiver fora do padrão, o console do navegador (F12) explica o motivo.
