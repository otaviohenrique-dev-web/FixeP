# FrixeP: zonas e mapas (decisões oficiais)

Status: decisões de 27/11/2026, em fase de **refino e previews**. Nenhuma zona nova entra no jogo antes de o dono aprovar o preview (seção 6).
Quando este documento e outro divergirem sobre zonas, mapas ou cenário, este vence. A direção visual (cores, ícones, personagens) continua em [DIRECAO_ARTE.md](DIRECAO_ARTE.md); a regra técnica de grid em [ART_GUIDE.md](ART_GUIDE.md).

## 1. Tamanho das zonas

- **Medida de referência:** atravessar um mapa em linha reta a pé. Como o jogo só tem movimento a pé e a velocidade base é `MOVE_SPEED = 4` tiles/s (`packages/shared/src/index.ts`), o tempo de travessia alvo é de **45 s a 1 min 30 s**.
- Isso dá **180 a 360 tiles** por lado.
- **Alvo base: 240 x 240 tiles** (cerca de 60 s de travessia reta). Faixa aceita: de 180 a 360 por lado, conforme o bioma e o conteúdo pedidos.
- A montaria rápida (futura) encurta o tempo de viagem, mas **não muda o tamanho do mapa**.
- Os mapas atuais (48 x 48, 36 x 36 em `packages/shared/src/zones.ts`) são **provisórios** e serão substituídos pelos mapas novos. Nada nesta seção obriga a mudar o código antes da aprovação do preview.

## 2. Proibição: mapa desenhado por código

**A partir de agora, é proibido criar mapas por código.** Terreno, caminhos, casas, árvores, rochas, pontes, muralhas e qualquer cenário nascem no editor de mapas (Tiled), com tiles e props de arte.

- O código fica com a lógica do jogo, a luz (dia e noite), as partículas, o som e a interface.
- `packages/client/src/town.ts` e `packages/client/src/townart.ts` desenham a cidade por código. São **legado a remover**, e saem quando o mapa de Brasalume em arte estiver aprovado.

## 3. Estilo visual: 2D isométrico com profundidade

- **Não é 3D.** É 2D isométrico em pixel art, com **profundidade visual** (2.5D de apresentação): objetos têm altura, sombra projetada e ordem por profundidade.
- Pixel simples na superfície, composição rica por dentro: cenário denso, camadas de altura, detalhes que contam história sem texto.
- Referências de mundo: **Diablo II** (cenário denso, objetos altos com profundidade) e **Albion Online** (câmera a ~45°, leitura clara de caminhos e ícones).
- Câmera e tile: losango 64 x 46 px (ver [ART_GUIDE.md](ART_GUIDE.md), seção 2).

## 4. Conteúdo obrigatório por zona (a decidir)

Cada zona nova precisa de conteúdo espalhado pelo mapa inteiro, não só em pontos isolados. Os números abaixo ainda **não foram decididos**:

- **Mobs por todo o mapa:** tipos, densidade e distribuição por bioma.
- **Dungeons:** quantidade por zona, entrada e formato.
- **Eventos:** tipos e gatilhos.
- **Coleta:** recursos (minério, ervas, madeira etc.), onde ficam e como reaparecem.

Quando o dono decidir, cada item entra aqui com o valor fechado e a data.

## 5. Ferramentas

- **Tiled:** editor dos mapas. O arquivo `.tmj` é a fonte da verdade do layout. Camadas padrão: `chao`, `decoracao`, `colisao`, `objetos`, e uma camada de pontos (spawn, portal, chegada, baú, NPC).
- **Aseprite (ou equivalente):** tiles, transições de borda e props, em `assets/source/`.
- **Preview de validação (antes do jogo):** uma página de visualização isolada, fora do jogo, que abre o `.tmj` com a mesma câmera e a mesma luz (dia, entardecer, noite). É a ferramenta para o dono aprovar uma zona antes de qualquer integração.

## 6. Processo: preview antes de implementar

1. Montar o greybox da zona no Tiled (formas e fluxo, sem arte final).
2. Gerar o preview e a arte da zona, validar com o dono no preview.
3. Só depois de aprovado: colisão no servidor, pontos do mapa e conteúdo.
4. Cada passo fecha com teste automático e conferência no navegador (celular 375 x 812 e PC 1280 x 720).

## 7. Fluxo de entrega

- Toda mudança vai para a branch `dev` por PR, com base `dev`. A `main` só recebe update quando o dono pedir.

## Pendências de decisão

- Tamanho da cidade de Brasalume (mesma faixa das zonas ou menor).
- Densidade e tipos de mobs (seção 4).
- Quantidade e formato das dungeons (seção 4).
- Tipos de evento e de coleta (seção 4).
