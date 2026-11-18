# FrixeP

MMO RPG 2D isométrico dark fantasy (navegador). Phaser 3 + Colyseus + PostgreSQL/Redis.

## Rodar (F0)

```
npm install
npm run dev:server   # ws://localhost:2567
npm run dev:client   # http://localhost:5173
```

Abra duas abas: os jogadores aparecem andando no mapa (clique para mover).

## Classes e controles de combate

As teclas são as mesmas nas três classes; muda o que cada uma faz. Todas as definições (dano, recarga, alcance)
ficam em `packages/shared/src/index.ts` (`CLASS_DEFS`) e o servidor decide todos os resultados.

| Tecla | Guerreiro (120 vida, tanque) | Arqueiro (90 vida, dano à distância) | Clérigo (100 vida, suporte) |
|---|---|---|---|
| ESPAÇO | Golpe corpo a corpo | Flecha | Raio sagrado |
| Q | Giro (área ao redor) | Perfurar (flecha que atravessa) | Cura (aliados num raio de 4) |
| W | Carga (avanço que machuca) | Cilada (armadilha no chão, até 3) | Brasa (aliados +25% de poder por 6 s) |
| E | Grito (reduz dano e provoca) | Chuva (área atingida após 0,8 s) | Reviver (levanta um aliado caído a até 8 tiles) |
| R (ultimate) | Terremoto (área grande, 80 de Fúria, recarga 40 s) | Salva Final (chuva enorme, 80 de Foco, 40 s) | Luz Divina (cura forte num raio de 6, 90 de Mana, 45 s) |
| SHIFT | Esquiva (3 tiles) | Rolamento longo (5 tiles) | Esquiva (3 tiles) |

**F** bebe uma poção. Mouse: clique no chão para andar e a mira segue o ponteiro.

**Celular:** joystick flutuante com o polegar esquerdo (toque em qualquer ponto da metade de baixo à esquerda e arraste; tocar no campo de visão não anda mais);
botões em arco no canto direito (ataque grande, Q, W, E, R, esquiva e poção). A mira vai para o inimigo mais próximo.
Quem cai fica 8 s no chão antes de renascer no ponto inicial, o tempo que o Clérigo tem para reviver.
XP e loot são divididos entre todos os jogadores vivos a até 14 tiles de um abate, e cada um faz a sua rolagem.

### Recurso de cada classe e HUD

Cada classe tem um **recurso** que as habilidades gastam e que regenera sozinho (o servidor controla; sem recurso a habilidade não sai e a recarga não é gasta):

| Classe | Recurso | Máx. | Regen./s | Custos |
|---|---|---|---|---|
| Guerreiro | Fúria | 100 | 5 | Giro 25, Carga 30, Grito 35 |
| Arqueiro | Foco | 100 | 6 | Perfurar 20, Cilada 25, Chuva 35 |
| Clérigo | Mana | 120 | 6 | Raio 4, Cura 30, Brasa 25, Reviver 50 |

A Esquiva e os ataques básicos do Guerreiro e do Arqueiro são de graça. O máximo cresce a cada nível (`maxManaFor`).
A HUD (`packages/client/src/hud.ts`) tem: retrato, nome, vida (coração) e recurso no canto superior esquerdo; as 5 habilidades embaixo
(tecla, custo, recarga, escurece sem recurso); e uma linha fina de XP na largura toda com o nível. O visual é original do FrixeP.
Teste: `SERVER=http://localhost:2999 npm run test:mana -w @frixep/server` (17 verificações).

### Chat da zona

Enter abre o campo de texto (e envia), Esc fecha; no celular há um botão de balão no canto. Fechado, as mensagens somem aos poucos.
Todos na mesma zona veem. O servidor (`ZoneRoom`) é quem manda: usa o **nome do personagem** (ignora qualquer nome vindo do cliente),
aceita de 1 a 200 caracteres, remove tags HTML e caracteres de controle e limita a 5 mensagens a cada 8 s por jogador (excesso só gera aviso,
não derruba a conexão). Nada é guardado no banco. Enquanto você digita, as teclas de combate ficam desligadas.
Painel em `packages/client/src/chat.ts`. Teste: `SERVER=http://localhost:2999 npm run test:chat -w @frixep/server` (13 verificações).

### Modo PvP

Botão **PvP** sob o retrato (também no celular). Clicar inicia uma **canalização de 5 s** (barra no centro da tela); só ao terminar sem dano você entra no modo.
**Qualquer dano recebido cancela a canalização na hora** (golpe de inimigo, projétil, habilidade de outro jogador, área, armadilha) e aparece "Canalização interrompida".
Clicar de novo durante a canalização a cancela. Para sair, o botão canaliza 5 s do mesmo jeito. Quem está em PvP tem o nome em vermelho com ⚔ e o botão "PvP ativo".
Regras (decididas no servidor, `ZoneRoom`): é todos contra todos na mesma zona, mas o dano entre jogadores só acontece se **ambos** estão em PvP;
quem está fora nunca é ferido por outro jogador (cura e Brasa continuam valendo para todos). Morrer em PvP usa o respawn normal (8 s, com 2 s de proteção ao renascer), sem perder XP nem itens.
Estado sincronizado no jogador: `pvp` e `pvpChan` (0 nenhuma, 1 entrando, 2 saindo); mensagem do cliente: `pvp { on: boolean }` (validada e com limite de taxa).
Teste: `SERVER=http://localhost:2999 npm run test:pvp -w @frixep/server` (29 verificações).

### Corpos provisórios

Sem arte final em `assets/characters` e `assets/monsters`, o jogo usa os corpos de `assets/placeholder/` (gerados por
`python tools/gen_placeholder_bodies.py`, precisa de Pillow). Quando o dev de arte entregar um atlas, ele passa na frente
automaticamente. Esses PNGs ficam **fora do Git LFS** de propósito (`.gitattributes`).

## Ícones dos itens

O kit atual dos 13 itens é original do projeto e vem de `python tools/gen_item_icons.py` (Pillow; apaga e recria `assets/items/item_<id>.png`, 48x48).
Para trocar por arte desenhada à mão basta substituir os PNGs com os mesmos nomes (e não rodar o gerador depois). Atenção: `tools/build_kits.py items` também escreve nessa pasta.

### Nível, XP e inimigos

- Nível máximo: **50**. O XP para subir cresce 20% por nível (`xpToNext`: 100, 120, 144, 173, 207...). A linha fina de XP no pé da tela mostra `NV 4 · 153 / 173`.
  A migração `003_level_cap_50.sql` troca a trava do banco (antes 1 a 20); ela roda sozinha ao subir o servidor, inclusive no Supabase.
- O inimigo mostra o nome acima da barra de vida e o **nível** só como número, grande, à direita da barra (a cor indica se é fácil, igual ou perigoso para o seu nível).
  O XP ganho aparece como `+N XP` dourado, com a mesma animação do dano, só depois do abate e só para quem recebeu.
  Vida, dano e XP crescem com o nível do inimigo (`enemyHp`, `enemyDmg`, `enemyXp`); o nível de cada ponto de nascimento fica em `ENEMY_SPAWNS`.
- Todo personagem mostra o **nível** num selo ao lado da barra de vida. A borda muda a cada 10 níveis: bronze (1-9), prata (10-19), ouro com borda dupla (20-29),
  azul-gelo (30-39), violeta (40-49) e brasa (50), os três últimos com brilho. A moldura do retrato na HUD acompanha a mesma faixa (`levelTier` e `LEVEL_TIER_COLORS` em `packages/shared`).
- Quem fala no chat da zona também vê o balão de fala sobre a cabeça do personagem por 6 s.

## Mochila e equipamento

| Ação | Tecla |
|---|---|
| Abrir/fechar a mochila | I ou B (ESC fecha) |
| Beber a primeira poção | Q (recarga de 6 s) |

Esqueletos soltam equipamentos (comum, incomum e raro) e poções direto na mochila (20 espaços). Armas dão bônus de
poder (dano e cura) e armaduras, de vida; cada item tem nível mínimo. **Armas são exclusivas de cada classe**
(espadas, arcos e cajados) e só caem para quem pode usá-las; armaduras e poções servem a todos. Tudo é decidido e
validado no servidor e salvo no banco.

## Teste anti-trapaça

Suíte que age como cliente malicioso (token forjado, speed hack, spam de skills, dano injetado,
payloads malformados, flood, adulteração do estado local). Rode contra um servidor de teste
(porta diferente da do jogo) a partir de `packages/server`:

```
PORT=2999 PGLITE_DIR=memory API_RATE_MULT=100 npm run start        # terminal 1 (banco em memória)
SERVER=http://localhost:2999 npm run test:cheat                    # terminal 2: anti-trapaça (25 verificações)
SERVER=http://localhost:2999 npm run test:persist                  # terminal 2: contas, personagem e XP (34 verificações)
npm run test:inv:unit                                              # regras do inventário, classes e banco, sem servidor (55 verificações)
```

Os testes de ponta a ponta do inventário e das classes exigem loot garantido (`LOOT_TEST=1`, ignorado em produção):

```
PORT=2999 PGLITE_DIR=memory API_RATE_MULT=100 LOOT_TEST=1 npm run start   # terminal 1
SERVER=http://localhost:2999 npm run test:inv                              # terminal 2 (16 verificações)
SERVER=http://localhost:2999 npm run test:classes                          # terminal 2 (Arqueiro + Clérigo juntos, 33-34 verificações)
```

No PowerShell: `$env:PORT=2999; $env:PGLITE_DIR="memory"; $env:API_RATE_MULT=100; $env:LOOT_TEST=1; npm.cmd run start`.
Saem com código 1 se qualquer verificação falhar. Veja também `docs/DEPLOY_SUPABASE_RENDER.md`.



## Deploy

`render.yaml` descreve os serviços do Render. Veja `docs/DEPLOY_SUPABASE_RENDER.md` (Parte 5).

## Painel de FPS e ping (desenvolvimento)

No canto superior direito do jogo aparecem os **FPS** (quadros desenhados por segundo) e o **ping** (ida e volta até o servidor, medido a cada 2 s).
Verde é bom, amarelo é atenção e vermelho é ruim (FPS abaixo de 25, ping acima de 180 ms).
**F3** liga e desliga (a escolha fica salva no navegador); `?stats=0` esconde e `?stats=1` mostra pela URL.
Para publicar sem o painel por padrão, defina `VITE_SHOW_STATS=0` na montagem do site (Render > frixep-client > Environment).

> **Atenção ao rodar servidores de teste:** o `.env` agora tem a `DATABASE_URL` do Supabase e ela tem prioridade sobre `PGLITE_DIR`.
> Para testes locais **não carregue o `.env`** (rode `npx tsx src/index.ts` com `JWT_SECRET` inline) ou use `DB_SCHEMA=frixep_test`.

## Arte no jogo (sprites)

O jogo desenha **sprites animados** quando encontra o atlas do personagem e **círculos** quando não encontra, então a arte pode
chegar aos poucos (por exemplo, só o Guerreiro primeiro). Basta salvar o PNG + JSON exportados do Aseprite e recarregar a página:

| Arquivo (em `assets/`) | O que vira no jogo |
|---|---|
| `characters/warrior.png` + `.json` | Guerreiro |
| `characters/archer.png` + `.json` | Arqueiro |
| `characters/cleric.png` + `.json` | Clérigo |
| `monsters/skeleton.png` + `.json` | Esqueleto |

As **tags** do Aseprite definem as animações (`idle_se`, `walk_ne`, `attack_se`...). Convenção completa em
`docs/GUIA_ARTE_INICIAL.pdf`. Direções ausentes são espelhadas (SW usa SE, NW usa NE) ou substituídas pela mais próxima.
Se um JSON estiver fora do padrão, o console do navegador (F12) explica o motivo; se o PNG vier quebrado do GitHub, rode `git lfs pull`.

**Atlas de depuração** (bonecos provisórios, só para testar o carregador; **não é arte do jogo** e não vai para o Git):

```
python tools/gen_debug_atlas.py          # precisa de Python e Pillow
# depois abra http://localhost:5173/?atlas=debug
```

Testes da lógica do carregador: `npm run test:sprites -w @frixep/client` (40 verificações).
