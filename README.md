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

As teclas são as mesmas nas quatro classes; muda o que cada uma faz. Todas as definições (dano, recarga, alcance)
ficam em `packages/shared/src/index.ts` (`CLASS_DEFS`) e o servidor decide todos os resultados.

| Tecla | Guerreiro (120 vida, tanque) | Arqueiro (90 vida, dano à distância) | Clérigo (100 vida, suporte) | Mago (75 vida, dano explosivo) |
|---|---|---|---|---|
| ESPAÇO | Golpe corpo a corpo | Flecha | Raio sagrado | Dardo Arcano |
| Q | **Investida** (avanço com o escudo: fere e **atordoa 1,5 s** quem estiver no caminho) | Perfurar (flecha que atravessa) | **Dois Q à escolha** (tecla **Z** ou botão ⇄): **Cura em Área** (todos num raio de 4, pouca) ou **Cura Focada** (um aliado, bem mais forte) | Bola de Fogo (projétil que explode em área) |
| W | **Correntes** (correntes e raízes brotam do chão e **enraízam** a área por 3,5 s) | Cilada (armadilha no chão, até 3) | Compressor de Ar (puxa os inimigos de uma área para o ponto mirado e os atordoa por 1,2 s) | Relâmpago (raio do céu, quase instantâneo) |
| E | **Escudo Refletor** (provoca; -50% de dano; **devolve 75%** do golpe a quem o atacou, por 5 s) | Chuva (área atingida após 0,8 s) | Julgamento (dano em área média, atinge após 0,6 s) | Chuva de Fogo (área grande, 0,9 s) |
| R (ultimate) | **Queda do Colosso** (uma espada gigante desaba do céu após 1,5 s: dano 120, raio 4,2 e **atordoa 2,2 s**; 80 de Fúria, recarga 40 s) | Salva Final (chuva enorme, 80 de Foco, 40 s) | Luz Divina (cura forte num raio de 6, 90 de Mana, 45 s) | **Meteoro** (o maior golpe do jogo: 140 base, raio 4,2, cai após 1,5 s, 100 de Mana, 45 s) |
| SHIFT | Esquiva (3 tiles) | Rolamento longo (5 tiles) | Esquiva (3 tiles) | Passo arcano (4 tiles) |

O **Mago** é a classe de dano explosivo e o menor sustain (75 de vida, nenhuma cura). Suas habilidades **descem do céu** (eixo Z, ideia do Diablo): o servidor manda `fx` no telégrafo (`meteor`, `lightning`, `firerain`; `holy` e `arrows` para Clérigo e Arqueiro; `chains` e `colossus` para o Guerreiro) e o cliente anima a queda em diagonal e o impacto (`skyFx` em `main.ts`).

### Guerreiro: controle de grupo, reflexão e ultimate

O Guerreiro é o **tanque** do grupo (120 de vida, mitigação alta, provoca) e agora também **controla** a luta. Tudo é decidido no servidor (`ZoneRoom`); o cliente só mostra:

- **Atordoar** (Investida e Queda do Colosso): o inimigo atordoado **não age** (cancela o golpe que preparava) e mostra estrelas girando sobre a cabeça. Campo sincronizado `stunned`.
- **Enraizar** (Correntes): o inimigo **não anda**, mas ainda ataca quem estiver ao alcance dele. Correntes e raízes brotam do chão na área e ficam em volta dos pés (`rooted`).
- **Provocar + refletir** (Escudo Refletor, 5 s): inimigos num raio de 6 passam 3 s atacando você, o dano que você leva cai pela metade e **75% de cada golpe de inimigo volta** a quem o deu (evento `hit` com `refl`; raio azul do Guerreiro ao inimigo; cúpula de escudo pulsando em volta dele). O pulso sombrio dos chefes não é refletido.
- **Chefes resistem**: atordoar e enraizar duram só 40% (`BOSS_CC_RESIST`).
- **Queda do Colosso**: telégrafo no chão (sombra crescendo e anel pulsante), a espada cai do alto em diagonal (eixo Z) e, no impacto, tremor forte de câmera, clarão, ondas de choque, rachaduras no chão, destroços e coluna de luz.
- Custos: Investida 25, Correntes 30, Escudo 35, Colosso 80 de Fúria (máx. 100, regenera 5/s). Armas: o Montante aumenta o Colosso; a Lâmina Rúnica reforça Investida e Correntes e barateia o resto.

### Clérigo: escolha do Q

O Clérigo tem **dois Q** e o jogador escolhe: **(A) Cura em Área** (16 de cura em todos num raio de 4; 26 de Mana, recarga 5 s) ou **(B) Cura Focada** (65 de cura em **um** jogador, alcance 9; 30 de Mana, recarga 4 s).
A troca é pelo botão **⇄** sobre o Q (ou a tecla **Z**), **só fora de combate** (4 s sem causar nem receber dano; o servidor valida) e a HUD mostra qual está ativo (nome, ícone e custo do botão). A escolha fica salva neste navegador (`localStorage`) e é reenviada ao entrar.
Alvo da Cura Focada, no servidor: o jogador vivo **mais próximo da mira** (até 2,2 tiles dela e a até 9 tiles de você, você incluído); sem ninguém ali, cura **você mesmo**. No cliente a mira vai para o jogador **selecionado** (clique nele); no celular, para o aliado mais ferido por perto.
Mensagem do cliente: `q_mode { mode: 0 | 1 }`; estado sincronizado no jogador: `qMode`. O evento `heal` traz `from` (o raio verde vai do Clérigo ao alvo).
Testes: `npm run test:curandeiro -w @frixep/server` (14 verificações).

### Balanceamento de dano (Mago e Arqueiro)

Mago e Arqueiro estavam fortes demais por causa das habilidades em área; Guerreiro e Clérigo ficaram como estavam. O dano **base de todas as formas** foi reduzido (ataque, skills, ultimate, kits de arma e bônus percentual de armas e mãos secundárias):

| Dano base | Antes → depois |
|---|---|
| Mago | Dardo 15→13, Bola de Fogo 44→28, Relâmpago 40→26, Chuva de Fogo 62→38, Meteoro 230→140 |
| Arqueiro | Flecha 10→9, Perfurar 18→15, Cilada 28→18, Chuva 15→10, Salva Final 40→26 |
| Armas (% de dano) | Mago x0,70 e Arqueiro x0,75 do bônus da arma do Guerreiro/Clérigo; mãos secundárias: Tomo 40%→28%, Orbe Flutuante 30%→20%, Aljava 25%→18% |
| Kits de arma | Cajado Arcano 1,2→1,1; Orbe Instável 1,35→1,2 (área 1,3→1,2) e Meteoro 1,3→1,15; Arco Longo 1,1→1,05; Besta 1,3→1,15 (Perfurar 1,15→1,1) |

DPS estimado (`packages/shared/src/balance.ts`, nível 1 e sem equipamento; rotação ambiciosa com o recurso real de cada classe; "área" = 5 inimigos agrupados). Rode `npm run test:balance:unit -w @frixep/server` para ver a tabela:

| Classe | Alvo único antes → depois | Área antes → depois |
|---|---|---|
| Guerreiro | 24,9 → 24,3 | 63,3 → 57,2 (kit novo) |
| Arqueiro | 24,9 → 21,5 (-14%) | 43,4 → 34,7 (-20%) |
| Clérigo | 12,0 → 12,0 | 17,2 → 17,2 |
| Mago | 23,0 → 18,6 (-19%) | 45,3 → 32,8 (-28%) |

O simulador assume o Guerreiro colado nos 5 inimigos (risco de corpo a corpo); Mago e Arqueiro mantêm a vantagem de bater **à distância e sem risco**, ainda com o dobro da área do Clérigo.

**F** bebe uma poção. Mouse: clique no chão para andar e a mira segue o ponteiro.

**Balão das habilidades**: passe o mouse sobre um botão da barra (Golpe, Q, W, E, R, Esquiva, Poção) e espere ~0,4 s; no celular, **segure** o botão por ~0,4 s (não dispara; soltar fecha). Mostra o tipo, os números reais (dano, raio, duração, custo, recarga) e uma dica de combinação. Os números vêm de `CLASS_DEFS`; os textos ficam em `SKILL_TEXT` (`packages/shared/src/skilltips.ts`), por nome da habilidade.

**Celular:** joystick flutuante com o polegar esquerdo (toque em qualquer ponto da metade de baixo à esquerda e arraste; tocar no campo de visão não anda mais);
botões em arco no canto direito (ataque grande, Q, W, E, R, esquiva e poção). A mira vai para o inimigo mais próximo.
Quem cai fica 8 s no chão antes de renascer no ponto inicial.
XP e loot só vão para quem **participou** do abate (veja "Regras de combate e grupo"); os itens caem no chão (veja "Mochila, equipamento, raridades e chefes").

### Recurso de cada classe e HUD

Cada classe tem um **recurso** que as habilidades gastam e que regenera sozinho (o servidor controla; sem recurso a habilidade não sai e a recarga não é gasta):

| Classe | Recurso | Máx. | Regen./s | Custos |
|---|---|---|---|---|
| Guerreiro | Fúria | 100 | 5 | Investida 25, Correntes 30, Escudo Refletor 35, Queda do Colosso 80 |
| Arqueiro | Foco | 100 | 6 | Perfurar 20, Cilada 25, Chuva 35 |
| Clérigo | Mana | 120 | 6 | Raio 4, Cura em Área 26 / Cura Focada 30, Compressor de Ar 30, Julgamento 30 |
| Mago | Mana (violeta) | 140 | 7 | Dardo 4, Bola de Fogo 30, Relâmpago 28, Chuva de Fogo 45, Meteoro 100 |

A Esquiva e os ataques básicos do Guerreiro e do Arqueiro são de graça. O máximo cresce a cada nível (`maxManaFor`).
A HUD (`packages/client/src/hud.ts`) tem: retrato, nome, vida (coração) e recurso no canto superior esquerdo; as 5 habilidades embaixo
(tecla, custo, recarga, escurece sem recurso); e uma linha fina de XP na largura toda com o nível. O visual é original do FrixeP.
Teste: `SERVER=http://localhost:2999 npm run test:mana -w @frixep/server` (17 verificações).

## Zonas e travessia

Quatro zonas: a **Cidade segura** (onde todos nascem) e três de combate. Cada uma é uma sala própria no servidor (dados em `packages/shared/src/zones.ts`; salas `zone4`, `zone`, `zone2`, `zone3`):

| Zona | Tema | Inimigos (nível) | Recursos |
|---|---|---|---|
| 4. Cidade de Brasalume (segura) | pedras claras, lanternas e fogueiras | nenhum (sem dano, sem PvP, sem chefe) | comerciante, ferreira, baú pessoal, portais para as 3 zonas |
| 1. Cinzas | ruínas escuras | Esqueletos 1 a 3; chefe **Rei Ossudo** (nv 6) | itens até **incomum** |
| 2. Floresta Gélida | neve e gelo | Lobos Gélidos e Esqueletos 6 a 10; chefe **Lobo Alfa** (nv 11) | itens até **raro** (baú até épico) |
| 3. Catacumbas | pedra roxa | Espectros e Esqueletos 12 a 20; chefe **Soberano das Catacumbas** (nv 21) | itens até **épico** (baú até mítico) |

- **Sem faixa de nível**: qualquer jogador pode ir quando quiser. As zonas mais fundas são muito punitivas, mas soltam mais itens e raridades melhores (`drops` e `boss` em `zones.ts`).
- **Pontos de caça (estilo MU)**: cada zona tem, além dos inimigos soltos, grupos de 4 a 6 inimigos espalhados num círculo em volta de um ponto fixo (`count`, `spread` e `levelMax` em `ZONES[...].enemies`; `expandSpawns` gera as posições, sem sorteio). A coleira dos inimigos subiu de 14 para 24 tiles (espectro 26) para o grupo poder perseguir sem voltar ao ponto. Pontos novos entram sempre no FIM da lista (os ids e1, e2... não mudam) e a mais de 10 tiles de onde o jogador chega.
- **Em combate não se atravessa**: quem causou ou recebeu dano há menos de 8 s (`TRAVEL_COMBAT_LOCK_S`) não atravessa portal nem usa o portão: o servidor recusa e avisa "Em combate: espere Ns para atravessar". Morrer leva à cidade normalmente.
- **Travessia como no Albion**: basta andar até o anel brilhante do portal (sem apertar nada). O servidor valida a posição, grava a zona do personagem (coluna `characters.zone`, migração `004_zone.sql`) e manda o cliente entrar na sala nova. Quem pede a sala de outra zona é recusado (403).
- Ao reconectar, o personagem volta para a zona em que estava; **ao morrer numa zona de combate, renasce na cidade** (o servidor grava a zona 4 e manda o cliente entrar na sala dela). Uma sessão por conta vale em todas as zonas.
- **Personagem novo nasce na cidade** (a migração `009_cidade_bau.sql` troca o padrão da coluna `characters.zone` para 4; contas e personagens que já existem ficam onde estão).
- O mapa de cada zona é desenhado por código (cores provisórias por tema); o Lobo Gélido tem kit de sprites próprio (`python tools/gen_wolf.py` recria `assets/placeholder/wolf.*`; arte final em `assets/monsters/wolf.*` tem prioridade) e o Espectro das Catacumbas também (`python tools/gen_wraith.py`, `assets/placeholder/wraith.*`).
- Teste: `SERVER=http://localhost:2999 npm run test:zones -w @frixep/server`. Fora disso, os testes de combate precisam de personagens que nasçam numa zona com inimigos: suba o servidor de teste com `TEST_START_ZONE=1` (só fora de produção; também faz quem morre renascer no lugar, em vez de na cidade) nessas suítes; `zones.mjs` e `cidade.mjs` rodam **sem** essa variável.

### Cidade segura (Brasalume, zona 4)

Praça central com fonte, casas e árvores, lanternas e fogueiras de luz quente, vaga-lumes e três portais (leste: Cinzas; norte: Floresta Gélida; oeste: Catacumbas), tudo desenhado por código (`packages/client/src/town.ts`, tema `town`). É o único lugar com o **comerciante Garrick**, a **ferreira Brasa** (e o futuro leiloeiro) e o **baú de armazenamento**; as zonas de combate não têm mais NPCs, só um portal de volta à cidade (as Cinzas, a Floresta e as Catacumbas).

- **Segura de verdade, no servidor** (`zone.safe`): sem inimigos nem chefe; o PvP não liga (aviso "a cidade é um lugar de paz"); `damagePlayer` ignora qualquer dano na zona, então habilidades de área, projéteis e armadilhas também não ferem. Chat local, grupo, troca e lojas funcionam normalmente.
- A forja da cidade funde até a maior raridade do mundo (a cidade não tem drops próprios).

### Baú de armazenamento

Um baú grande fixo na praça (`vault` em `zones.ts`), **180 espaços em 6 páginas de 30**, mais tostões e óbolos. O conteúdo é **por personagem** (os equipamentos são de classe, a conta tem 1 personagem e a troca e o mercado também são por personagem; migrar para por conta depois é só mudar a chave da tabela).

- Persistência: tabela `vault_items (character_id, slot, item_id, qty)` e colunas `characters.vault_iron/vault_obols` (migração `009_cidade_bau.sql`). A bolsa e o baú são gravados **na mesma transação** (`saveInventoryAndVault`), pela fila de salvamento do jogador: o item está num lugar ou no outro, nunca nos dois nem em nenhum.
- Só abre perto (`VAULT_REACH` = 3,5 tiles) e o servidor reconfere a distância a **cada pedido** (depositar, retirar, mover, moedas). O baú é carregado do banco na primeira abertura; uma operação por vez por jogador (rajadas do mesmo espaço não duplicam nada). Valida espaço, quantidade (inteiro positivo), saldo e tetos; sem espaço, nada muda.
- Interface (`packages/client/src/vault.ts`, tema madeira/dourado): clique no baú (ou tecla **G** / botão "Abrir o baú" ao chegar perto). Toque seleciona, "Guardar"/"Levar" move (com quantidade); duplo toque move a pilha; arrastar entre bolsa e baú escolhe o espaço; tocar em outro espaço do baú reorganiza. Usável no celular (colunas empilhadas).
- Testes: `npx tsx test/vault.unit.ts` (21 verificações: limites, conservação, moedas, persistência atômica) e `SERVER=http://localhost:2999 node test/cidade.mjs` com o servidor em `ECON_TEST=1` (29 verificações: segurança da cidade, baú, rajadas, pedidos inválidos, persistência, isolamento e renascer na cidade).
- **NPCs de ofício** (ferreira Brasa, comerciante Garrick e leiloeiro Ossian) têm kits de sprites próprios gerados por código: `python tools/gen_npcs.py [prévia.png]` recria `assets/placeholder/npc_smith|npc_merchant|npc_auctioneer.*` (quadros 64x64, 4 diagonais, tags `idle`, `talk` e uma de ofício: `work`, `count`, `gavel`). Brasa tem avental, óculos, martelo e bigorna com barra em brasa, fumaça e fagulhas; Garrick, capuz, lanterna que balança, bolsas de moedas e balança; Ossian, cartola e monóculo, martelo de leilão e púlpito com livro, sino e vela. No jogo o NPC se vira para o jogador, gesticula (`talk`) quando a janela abre e faz o seu ofício de tempos em tempos; a placa (nome, ofício e emblema) é desenhada no cliente. Arte final em `assets/npcs/npc_<tipo>.*` tem prioridade; sem os arquivos, o cliente usa as figuras desenhadas por código de antes.

### Chat da zona

Enter abre o campo de texto (e envia), Esc fecha; no celular há um botão de balão no canto. Fechado, as mensagens somem aos poucos.
Todos na mesma zona veem. O servidor (`ZoneRoom`) é quem manda: usa o **nome do personagem** (ignora qualquer nome vindo do cliente),
aceita de 1 a 200 caracteres, remove tags HTML e caracteres de controle e limita a 5 mensagens a cada 8 s por jogador (excesso só gera aviso,
não derruba a conexão). Nada é guardado no banco. Enquanto você digita, as teclas de combate ficam desligadas.
Painel em `packages/client/src/chat.ts`. Teste: `SERVER=http://localhost:2999 npm run test:chat -w @frixep/server` (13 verificações).

### Modo PvP

Botão **PvP** sob o retrato (também no celular). Clicar inicia uma **canalização de 5 s** (barra no centro da tela); só ao terminar você entra no modo. Para sair, o botão canaliza 5 s do mesmo jeito.
**Entrar ou sair só começa com você PARADO e sem ter tomado dano nos últimos 5 s** (`PVP_NO_DAMAGE_S`); senão o servidor recusa e avisa o motivo ("Fique parado para canalizar o PvP." ou "Você tomou dano há pouco: aguarde Ns...").
Durante a canalização, **mover-se, agir (atacar ou usar habilidade) ou tomar dano cancela na hora** (golpe de inimigo, projétil, habilidade de outro jogador, área, armadilha) e o aviso diz qual foi o motivo.
Clicar de novo durante a canalização também a cancela. Quem está em PvP tem o nome em vermelho com ⚔ e o botão "PvP ativo".
Regras (decididas no servidor, `ZoneRoom`): é todos contra todos na mesma zona, mas o dano entre jogadores só acontece se **ambos** estão em PvP;
quem está fora nunca é ferido por outro jogador (a cura continua valendo para todos). Morrer em PvP usa o respawn normal (8 s, com 2 s de proteção ao renascer), sem perder XP nem itens.
Estado sincronizado no jogador: `pvp` e `pvpChan` (0 nenhuma, 1 entrando, 2 saindo); mensagem do cliente: `pvp { on: boolean }` (validada e com limite de taxa).
Teste: `SERVER=http://localhost:2999 npm run test:pvp -w @frixep/server` (38 verificações).

### Grupo (party)

Até **4 jogadores**. O grupo vive no servidor (`packages/server/src/game/party.ts`), entre as salas de zona, e **atravessa os portais**: a identidade do membro é o personagem, não a sessão.
- **Convidar**: clique (ou toque) no jogador no mapa para abrir o menu dele; ali ficam **Convidar para grupo** (quem convida vira o líder) e **Pedir para entrar no grupo** (entra no grupo de quem aceitar; se esse jogador não tem grupo, quem aceitou vira o líder). Ver Perfil, Pedido de amizade, Sussurrar, Trocar e Bloquear aparecem desligados ("Em breve"). Também dá para digitar **`/pt nome_do_jogador`** no chat ou usar o **+** do painel.
- **Chat do grupo**: **`/g texto`** (aparece como "[Grupo] Nome:" e chega aos membros mesmo em outra zona; mesmas regras de tamanho, limpeza e taxa do chat da zona).
- **Painel** no canto esquerdo, abaixo do retrato: nível (com a borda da faixa), nome, coroa do líder, barras de vida e do recurso, e a zona do membro (ou "ausente"). Clicar no cabeçalho recolhe. O líder clica num colega para **passar a liderança** ou **expulsar**; **Sair** deixa o grupo. Colegas aparecem com a barra de vida azul e o nome azul sobre a cabeça.
- **Regras** (todas validadas no servidor): convite vale 30 s; só o líder convida; recusa alvo inexistente/offline, já em grupo, o próprio jogador e grupo cheio; um convite pendente por alvo e espera de 1,5 s entre convites do mesmo jogador. Quando o líder sai, o membro mais antigo assume; com um só restante o grupo se desfaz. Quem cai do jogo fica **ausente por 45 s** (dá para recarregar a página ou atravessar um portal) e depois sai do grupo. O grupo **não é salvo no banco**.
- **Combate**: membros do grupo **nunca se ferem em PvP**; a Cura vale como antes. **XP e loot são divididos entre os membros elegíveis** (regras na seção "Regras de combate e grupo").
- **Limitação**: o registro de grupos fica na memória do processo, então só funciona com **uma instância** do servidor (como hoje no Render). Com várias instâncias seria preciso um armazenamento compartilhado (ex.: Redis).
- Mensagens novas (`packages/shared/src/index.ts`): `party_invite`, `party_join`, `party_accept`, `party_decline`, `party_leave`, `party_kick`, `party_lead`, `party_chat`, `party_sync`; eventos `party`, `party_invite`, `party_invite_end`, `party_chat`. O jogador ganha o campo sincronizado `party` (id do grupo).
- Painel e menu: `packages/client/src/party.ts`. Teste: `PARTY_TEST=1` nos **dois** lados (servidor e teste; encurta o convite para 2 s e a ausência para 3 s e tira a espera entre convites): `PARTY_TEST=1 SERVER=http://localhost:2999 npm run test:party -w @frixep/server` (63 verificações; XP dividido: 13 para cada um no abate em dupla, passante sem nada).

### Corpos provisórios

Sem arte final em `assets/characters` e `assets/monsters`, o jogo usa os corpos de `assets/placeholder/`. Guerreiro, Arqueiro, Clérigo e Mago (chapéu pontudo e cristal violeta) têm desenho dark fantasy (aço escuro e capa carmesim; capuz e arco longo; manto de cinzas com cajado de brasa) em `tools/gen_heroes.py`; o Esqueleto continua simples. Gerados por
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
- Jogadores e inimigos têm uma **placa** sobre a cabeça (`packages/client/src/plate.ts`): nome em cima; embaixo, o selo de nível à esquerda e a barra de vida segmentada.
  A moldura do selo muda a cada 10 níveis: bronze (1-9), prata (10-19), ouro com rebites (20-29), azul-gelo com brilho (30-39), violeta com gema e brilho (40-49)
  e brasa com gema e brilho pulsante (50). O retrato na HUD usa a mesma moldura (cor, rebites, gema, brilho) com o nível num selo no canto, e no lugar da barra de vida (que já está na placa) fica a **barra da faixa**: `Gelo · 33 / 40` mostra quanto falta para a próxima borda. A barra é verde para você, verde-clara para aliados e vermelha para inimigos e jogadores em PvP.
- Quem fala no chat da zona também vê o balão de fala sobre a cabeça do personagem por 6 s.

## Mochila, equipamento, raridades e chefes

| Ação | Tecla |
|---|---|
| Abrir/fechar a mochila | I ou B (ESC fecha) |
| Beber a primeira poção | F (recarga de 6 s) |

**Raridades** (`packages/shared/src/items.ts`): comum (cinza), incomum (verde), raro (azul), épico (dourado radiante), lendário (vermelho brilhante), mítico (púrpura pulsante).
Raridade maior exige mais nível e dá mais bônus. Quase todo o catálogo é **gerado por tabelas** (famílias x raridades); o id é `<família>_<raridade>` (ex.: `montante_epic`, `mage_helmet_rare`).

**Equipamento** (6 espaços, painel à esquerda da mochila): arma, mão secundária, elmo, armadura, botas e capa. Cada item é **exclusivo de uma classe**: qualquer classe pode *dropar*
itens de qualquer classe (então os da sua classe são ainda mais valiosos), mas só a classe do item equipa e só então ele vale. Os bônus: poder (%), vida, crítico, redução de dano, redução de recarga (botas, teto 30%), recurso máximo e regeneração (capa).
O botão discreto no topo da mochila (setas) **organiza**: junta pilhas e ordena por tipo, raridade e nome (mensagem `inv_sort`).

**Tipos de arma e kit**: cada classe tem 3 ou mais tipos, com requisito de nível mais alto nos mais exigentes. O tipo concede um **kit** de modificadores (dano, recarga, custo, área, alcance, cura, crítico, e ajustes só de uma habilidade), aplicado no servidor por `effectiveAction`:

| Classe | Tipos (mãos) | Foco |
|---|---|---|
| Guerreiro | Montante (2), Espada Larga (2), Lâmina Rúnica (2), Espada de Uma Mão (1, com escudo ou adaga) | golpes pesados e Colosso maior / equilíbrio e crítico / Investida e Correntes fortes e habilidades baratas / rapidez |
| Arqueiro | Arco Longo (2), Arco Curto (1), Besta (1); mão secundária: Aljava | alcance / velocidade / dano e crítico |
| Clérigo | Cajado Sagrado (2), Cetro (1), Maça (1); mão secundária: Escudo Sagrado ou Relicário | cura / dano e velocidade / misto |
| Mago | Cajado Arcano (2), Varinha (1), Orbe Instável (2); mão secundária: Tomo Arcano ou Orbe Flutuante | explosões maiores / conjuração rápida e barata / Bola de Fogo e Meteoro |

Arma de duas mãos libera a mão secundária (o item volta à mochila); com arma de duas mãos não se equipa a secundária. Não há atributos no jogo, então o requisito é só de **nível**.

**Drops no chão** (`ZoneRoom`): o abate solta os itens no chão, visíveis a todos na cor da raridade (brilho; coluna de luz de raro para cima). Só o **dono de cada item** (rodízio entre os elegíveis do abate) pega por 30 s (baú do chefe: 60 s);
um **anel em volta do item esvazia como relógio** e um número mostra os segundos (colorido para quem pode pegar, cinza para os outros). Depois disso qualquer um pega; o item some em 3 min. Para pegar, basta andar até ele (ou clicar nele de perto: `pickup { id }`).
**Raridade do drop**: cada zona tem um **teto** (tabela `drops` em `zones.ts`): impossível épico na zona 1. Taxas baixas: 7%/9%/11% de equipamento por abate e 8%/10%/12% de poção; raro ou melhor fica abaixo de ~2% dos abates. Lendário e mítico **só saem de baús de chefe**.
**Animação de raridade**: ao receber item raro ou melhor, o centro da tela mostra um efeito que cresce com a raridade (`packages/client/src/loot-fx.ts`): raro, anel azul; épico, raios dourados; lendário, chamas e anéis vermelhos; mítico, aura púrpura pulsante com estrelas.

**Chefes** (um por zona, `boss` em `zones.ts`): aparecem sempre em campo, com 15 a 18 vezes a vida de um inimigo do mesmo nível, golpe mais forte, **pancada em área** telegrafada em volta deles (a cada 8 a 9 s) e **fúria** abaixo de 30% de vida (mais rápidos, pancadas mais seguidas). Dão 8 a 10 vezes o XP.
Ao morrer reaparecem em 5 / 7 / 10 min (`respawnS`) e o servidor avisa a todos ("Rei Ossudo despertou!"). **O baú** só existe quando o chefe morre: **cada jogador que lutou** (e está por perto) ganha a sua própria rolagem (elegíveis: veja "Regras de combate e grupo"), reservada a ele, e o cliente mostra a explosão do baú (`chest`).
Zona 1: 2 itens, no máximo incomuns; zona 2: 3 itens, o primeiro pelo menos raro, até épico; zona 3: 3 itens, o primeiro pelo menos épico, com lendário (~18%) e mítico (~2%).

**Itens antigos**: os 13 itens da primeira versão são traduzidos ao carregar o inventário (`migrateItemId`: espada → Espada de Uma Mão; arco/cajado → equivalente; armadura → a da classe do personagem, mesma raridade) e gravados de novo no próximo salvamento. A migração `006_equipamentos.sql` libera os novos espaços de equipamento e a `005_mago.sql`, a classe `mage`.
Os ícones novos ainda não existem (`assets/items/item_<id>.png`); enquanto isso o cliente mostra um desenho provisório por tipo de item.

## Regras de combate e grupo

Tudo é decidido pelo servidor (`ZoneRoom.ts`); as constantes e fórmulas ficam em `packages/shared/src/index.ts`.

**Regeneração de vida (jogadores)**: sem causar nem receber dano por **6 s** (`PLAYER_REGEN_DELAY_S`), o personagem recupera **2% da vida máxima por segundo** (`PLAYER_REGEN_PCT_S`; vida cheia em ~50 s). Qualquer dano dado ou recebido (inclusive PvP) zera a espera.

**IA dos inimigos (correção do "vai e volta")**: antes, o inimigo que passava da coleira (`leash`) ou perdia o alvo voltava para casa **se curando 20%/s** e, ao entrar de novo na coleira com o jogador por perto, voltava a persegui-lo: oscilava e a cura anulava o dano. Agora:
- Estados: `idle → chase → windup → recover` e o novo **`evade`**. Passou da coleira ou perdeu o alvo no meio da luta: entra em `evade`, ignora jogadores e provocação (Escudo Refletor) e **só volta a agir ao chegar em casa**. Não oscila.
- **O dano recebido sempre conta**: em `evade` o inimigo continua apanhando e **não recupera vida** enquanto for ferido.
- Cura: só **parado em casa ou voltando (`evade`) e sem apanhar há 5 s** (`ENEMY_REGEN`): 10% da vida máxima por segundo; chefe 8 s e 3%/s. Nada de cura durante a perseguição.
- Quem está além da coleira do ponto de origem do inimigo não vira alvo dele (evita "puxar" e perder o alvo em seguida).

**Quem recebe XP, tostões e loot de um abate (elegibilidade)**: nunca "todo mundo por perto". É elegível:
1. quem causou **pelo menos 10% da vida máxima** do alvo (`ELIGIBLE_DMG_PCT`), vivo e a até 28 tiles; e
2. os **colegas de grupo** (vivos, a até 21 tiles do alvo) de qualquer elegível, mesmo que não tenham atacado (curandeiro, tanque que só provoca).

Jogador **fora de grupo** e sem dano relevante **não ganha nada**; quem luta sozinho só recebe o que ele mesmo abateu/participou.
- **XP**: cada grupo elegível forma um pool `XP base x (1 + 0,25 x (membros - 1))` (`PARTY_XP_BONUS`, máx. 4 membros) e **divide em partes iguais** (ex.: 2 membros: 20 x 1,25 / 2 = 13 cada). Quem está fora de grupo recebe o XP cheio. Os **tostões do abate** seguem a mesma divisão.
- **Itens do abate**: saem por **rodízio** entre todos os elegíveis (um item para cada um, em ordem, contador por sala), cada um com **dono exclusivo** durante a reserva (30 s); esgotada, o item fica livre para qualquer um, como já era. Sem elegível (ex.: quem bateu saiu do jogo), o item cai livre.
- **Baú de chefe**: **cada elegível tem a SUA rolagem completa**, reservada a ele por 60 s.

**Chefes exigem grupo (tanque + curandeiro + dano)**: um jogador solo com build convencional não consegue vencer. Fórmula (`shared/src/index.ts`; `n` = jogadores elegíveis vivos a até 24 tiles do chefe):
- **Vida**: 15 a 18 vezes a de um inimigo do mesmo nível (antes 5 a 6): Rei Ossudo 3.240, Lobo Alfa 4.500, Soberano 9.720. O trio mata em ~1 a 2 min; o solo, não.
- **Dano do chefe** (golpe, pancada e pulso) `x bossDmgMult(n) = 1 + 0,75 x max(0, 3 - n)`: solo **x2,5**, dupla **x1,75**, trio ou mais **x1** (`BOSS_GROUP_MIN = 3`).
- **Pulso Sombrio**: a cada 6 s (telégrafo de 1,5 s) atinge **todos** a até 24 tiles com **40% da vida máxima** de cada um (x o multiplicador do grupo), **ignorando a esquiva**. Só se aguenta com **curandeiro** (Cura Focada ou em Área/Luz Divina); o **tanque** (Escudo Refletor: -50% de dano, provocação e reflexão) segura os golpes e pancadas para os que têm pouca vida; poções sozinhas (40 de vida a cada 6 s) não sustentam.
- **Fúria por tempo**: depois de 150 s de luta (`BOSS_ENRAGE_S`) o dano cresce +50% a cada 30 s, até x4 (`bossEnrageMult`). A fúria por vida baixa (<30%) continua.
- O contador de luta e o pulso começam no primeiro dano e zeram quando o chefe volta a se curar por inteiro, e ele só se cura depois de 8 s sem apanhar.
- Testes: `npm run test:boss:unit -w @frixep/server` (21 verificações, sem servidor) simula, com as constantes reais, que o solo (mesmo com todas as habilidades sem custo e armadura boa) morre antes de matar, que o trio com curandeiro aguenta o pulso e mata antes da fúria, e que o trio sem curandeiro não aguenta.

Tudo é decidido e validado no servidor e salvo no banco. **Ainda não feito**: efeitos visuais finais das armas (as skills são genéricas), ícones dos itens novos e arte própria dos chefes (usam o corpo do monstro maior, em escala e cor diferentes).

## Economia: moedas, comerciante, ferreira, troca e quebrar

Tema Submundo & Morte. Código compartilhado em `packages/shared/src/economy.ts` (preços, NPCs, regras da fusão); regras do servidor em `packages/server/src/game/economy.ts`; interface em `packages/client/src/economy.ts` (janelas) e `npcs.ts` (NPCs no mundo). **O servidor decide tudo**: distância até o NPC, saldo, espaço na mochila, chance da fusão. O cliente só pede.

**Moedas** (ícones em `assets/items/item_coin_*.png`, gerados por `python tools/gen_coin_icons.py`):
- **Tostões de Ferro** (disco de ferro escuro): todo abate dá uma quantia mínima a quem está por perto (como o XP; `mobIron`: ~2 + 1,5 x nível; chefes `bossIron`). Além disso cai uma **sacola de tostões** no chão, no mesmo sistema de itens (reserva do dono, anel de tempo, expira): ~10% / 12% / 15% dos abates nas zonas 1 / 2 / 3 (`ZONE_COINS`); todo baú de chefe traz uma sacola grande. Pegar a sacola soma ao saldo e não ocupa espaço.
- **Óbolos de Sangue** (moeda antiga com runa vermelha, a moeda VIP): raríssima. ~0,04% / 0,06% / 0,1% dos abates comuns e 8% / 12% / 18% dos baús de chefe. Ainda sem uso na loja: só se guarda e se troca.
- O saldo fica em `characters.iron` e `characters.obols` (migração `007_economia.sql`) e é gravado **na mesma transação do inventário**. Aparece na HUD (canto superior direito) e na mochila. Teto de 999.999.999.

**Preço médio** (`itemValue`): base por raridade (12 / 45 / 170 / 650 / 2.800 / 13.000) x tipo (arma 1,4; armadura 1,2; mão secundária e elmo 0,8; botas e capa 0,7) x (1 + 1,5% por nível exigido). Poção = 10. O comerciante **vende a 140%** do preço médio e **compra a 35%**; **quebrar** rende 12%. Nunca dá lucro comprar e revender.

**NPCs** (`ZONE_NPCS`, um **comerciante (Garrick)** e uma **ferreira (Brasa)**, só na **cidade segura**, na praça): com placa de nome. Clique no NPC (longe: o personagem anda até ele e abre ao chegar) ou, ao chegar perto (`NPC_REACH` = 3,5 tiles), o botão "Falar com ..." (tecla **G**). A janela fecha se você se afasta.
- **Comerciante**: *Comprar* lista poção e o equipamento **da sua classe** até raridade rara (o resto vem de chefes e da forja); *Vender* aceita qualquer item da mochila (equipado, não). Venda de item raro ou melhor pede um segundo clique.
- **Ferreira (fusão)**: **3 equipamentos do mesmo tipo, raridade e classe** + tostões viram **1 de raridade superior** (da mesma classe e tipo; a família sai entre as dos itens usados). Chance de sucesso por raridade de origem: comum 100%, incomum 85%, raro 65%, épico 45%, lendário 25%. Custo = 30% do valor-base do resultado. **Falhou**: perde a taxa e **1 dos 3 itens** (sorteado); os outros 2 voltam. **Teto**: a forja fica na cidade e vai até a maior raridade que o mundo deixa existir (mítico).

**Soltar e quebrar**: *Soltar* agora põe o item **no chão** (qualquer um pode pegar; quem soltou só o pega sozinho depois de 4 s, mas pode pedir). *Quebrar* destrói o equipamento e rende uma pequena quantia (só equipamento; poção se vende). Confirmação: comum e incomum, diálogo simples; **raro** exige esperar ~1 s e o servidor recusa sem `confirm: true`; **épico em diante** exige também **digitar QUEBRAR**.

**Troca entre jogadores** (selecione o jogador, "Trocar"): convite (20 s), os dois a até 8 tiles na mesma zona. Janela no estilo do Albion: **sua oferta** e **a oferta dele** lado a lado, mais a sua mochila embaixo (toque num item para oferecer; toque na oferta para tirar); os dois podem editar itens (até 8 espaços), tostões e óbolos. **Versão da oferta:** o servidor numera a oferta (`rev`) e qualquer mudança de qualquer lado a incrementa e **desfaz os aceites dos dois**; o "Aceitar" envia a versão que o jogador viu e o servidor recusa se ela já mudou. O botão fica ativo assim que há algo na oferta (sem espera artificial). Só conclui quando **os dois aceitaram a mesma versão**; aí o servidor confere tudo de novo (o que está em cada espaço, saldos, espaço livre, teto de moedas) e troca **em memória numa operação só** (cópias dos dois inventários, trocadas juntas) e grava **os dois personagens numa única transação**. Durante a troca a mochila fica travada. Sair, morrer, viajar ou se afastar cancela.

**Sussurro da troca** (chat privado dentro da janela): caixa recolhível (no celular começa fechada e mostra um • quando chega mensagem) com campo de texto e Enter. Mensagem `trade_chat` → o servidor confere que o remetente está numa troca ativa, limita a **120 caracteres** (`TRADE_CHAT_MAX_LEN`), aplica a mesma taxa (5 msgs/8 s) e a mesma sanitização do chat normal (`cleanChat`), e entrega **só aos dois da troca** (eco ao remetente). Nada é guardado: o histórico some quando a troca fecha. Teclas do jogo não disparam enquanto se digita (`isTypingTarget`). Testado em `test/economy.mjs`.

**Silhueta da bolsa:** o painel de equipamento usa uma silhueta SVG inline de figura humana anatômica de frente (cabeça, pescoço, ombros, braços afastados, cintura, pernas), desenhada simétrica e suave em azul escuro com contorno suave e brilho tênue, nítida em qualquer densidade; as posições dos espaços não mudaram.
*Bug corrigido (item sumia da oferta e o aceite travava):* o cliente adotava a oferta de cada evento do servidor, e um evento "velho" (por ex. quando o outro lado mexia na oferta dele) apagava o item recém-colocado antes de o pedido chegar. Agora cada pedido leva um contador (`seq`), o servidor o devolve em `mine.seq` e o cliente só adota a oferta do servidor quando nada dele está pendente; reenviar a mesma oferta não muda a versão nem derruba aceites.

**Inventário (estilo Albion, tema sombrio):** painel de equipamento à esquerda da mochila, com a silhueta do personagem e os espaços sobre o corpo (elmo na cabeça, armadura no peito, botas nos pés, arma e mão secundária nas laterais, capa, poção), moldura e brilho pela raridade (épico, lendário e mítico pulsam), dica ao passar o mouse com a **comparação de atributos** com o equipado (▲/▼), **arrastar e soltar** para equipar (o espaço compatível acende; arrastar o equipado para a mochila desequipa), duplo clique equipa/desequipa. O espaço de poção mostra o total e usa a pilha da tecla F. Comida, bolsa, anel e amuleto aparecem desenhados e **desabilitados** (ainda não existem). No celular o painel encolhe, sem rótulos, e o toque usa selecionar + botões.

**Mercado dos jogadores (leiloeiro Ossian, ao lado do ponto de nascimento de cada zona):** inspirado no mercado do Albion. Abas **Comprar** (busca por nome, filtros de classe, tipo, raridade e faixa de preço, ordenação por menor/maior preço, mais recentes ou raridade, 8 por página), **Vender** (escolhe um item ou parte de uma pilha da mochila e define o preço total) e **Minhas vendas** (listagens ativas, vendas a recolher, itens vencidos; "Recolher tudo").
- **Custódia:** ao listar, o item sai da mochila e fica guardado na própria listagem (`market_listings`, migração `008_mercado.sql`). Vence em **7 dias** e volta ao vendedor (que precisa ter espaço na mochila); cancelar também devolve.
- **Moeda:** qualquer item pode ser vendido em **Tostões de Ferro ou em Óbolos de Sangue** (a moeda rara, boa para itens míticos e lendários; preço de 1 a 99.999 Óbolos). A taxa de listagem e o pagamento usam a moeda do preço; a busca tem filtro de moeda (migração `009_mercado_obolos.sql`).
- **Preço mínimo por item:** metade do valor médio de mercado x quantidade, com piso de 25 (nas duas moedas); abaixo disso nem a taxa seria coberta. O servidor recusa; a tela não corrige nada: mostra uma mensagem curta ("Preço mínimo para este item: N") e deixa o botão desabilitado.
- **Taxa:** só a **taxa de listagem de 4% do preço** (arredondada ao tostão; o piso de 25 garante que o mínimo de 1 nunca distorce a %), cobrada ao listar e **não reembolsável**. Não há taxa de venda: o vendedor recebe o preço inteiro. Justificativa: o dono pediu só a taxa de listagem; ela já faz o papel de ralo de tostões e desencoraja listagens-fantasma. Para criar uma taxa de venda no futuro basta cobrar no `claim`.
- **Dinheiro offline:** a venda fica registrada (`status = sold`) e o vendedor recolhe quando quiser, mesmo que estivesse offline na hora da compra.
- **Atomicidade e anti-duplicação:** cada operação é UMA transação no banco: listar = listagem + mochila do vendedor; comprar = "reivindicar" a listagem (`update ... where status = 'active' and expires_at > agora`: só UMA de várias compras simultâneas vence) + mochila do comprador; a mochila em memória só muda depois que o banco aceitou e é desfeita se a gravação falhar. As operações de um jogador rodam na fila de salvamento dele (nada grava por cima) e a mochila fica travada para outros caminhos enquanto o banco decide.
- **Limites anti-abuso:** máx. 20 listagens ativas e 40 entre ativas e vendas não recolhidas por jogador; preço total de 5 a 99.999.999 Tostões; pedidos limitados pela taxa de mensagens; o servidor refaz todo filtro (nada vindo do cliente entra no SQL sem lista branca). Listagens encerradas há mais de 3 dias são apagadas sozinhas (limpeza preguiçosa, 1x/hora).
- Testes: `npm run test:market:unit` (sem servidor, relógio falso: listar, comprar, cancelar, expirar, taxa, limites, filtros, páginas, 3 compras simultâneas, falha de gravação) e `npm run test:market` (com 3 jogadores; servidor com `ECON_TEST=1 LOOT_TEST=1 MARKET_TTL_S=4`, que faz as listagens vencerem em 4 s, só fora de produção).

Testes: `npm run test:econ:unit` (sem servidor, 71 verificações: preços, compra, venda, quebrar, fusão, troca atômica, saldo, drops, persistência da troca) e, com o servidor em modo de teste `ECON_TEST=1 LOOT_TEST=1` (kit inicial: 50.000 tostões, 2 óbolos e itens, só fora de produção), `SERVER=http://localhost:2999 npm run test:econ` (com dois jogadores; inclui o cenário do bug da troca e a versão da oferta).

## Teste anti-trapaça

Suíte que age como cliente malicioso (token forjado, speed hack, spam de skills, dano injetado,
payloads malformados, flood, adulteração do estado local). Rode contra um servidor de teste
(porta diferente da do jogo) a partir de `packages/server`:

```
PORT=2999 PGLITE_DIR=memory API_RATE_MULT=100 npm run start        # terminal 1 (banco em memória)
SERVER=http://localhost:2999 npm run test:cheat                    # terminal 2: anti-trapaça (25 verificações)
SERVER=http://localhost:2999 npm run test:persist                  # terminal 2: contas, personagem e XP (34 verificações)
npm run test:inv:unit                                              # regras de itens, drops, chefes, classes e banco, sem servidor (109 verificações)
npm run test:balance:unit -w @frixep/server                        # DPS por classe e regras do kit novo, sem servidor (36 verificações)
```

Os testes de ponta a ponta do inventário e das classes exigem loot garantido (`LOOT_TEST=1`, ignorado em produção):

```
PORT=2999 PGLITE_DIR=memory API_RATE_MULT=100 LOOT_TEST=1 npm run start   # terminal 1
SERVER=http://localhost:2999 npm run test:inv                              # terminal 2 (17 verificações)
SERVER=http://localhost:2999 npm run test:mago                             # terminal 2 (Mago: 16 verificações)
SERVER=http://localhost:2999 npm run test:classes                          # terminal 2 (Arqueiro + Clérigo juntos, 33-34 verificações)
SERVER=http://localhost:2999 npm run test:guerreiro                        # terminal 2 (Guerreiro: atordoar, enraizar, refletir e a ultimate; 24 verificações)
SERVER=http://localhost:2999 npm run test:curandeiro                       # terminal 2 (Q do Clérigo: área x focada; 14 verificações)
```

Itens no chão e chefe (servidor com `LOOT_LOCK_S=3 BOSS_TEST=1`: reserva de 3 s e chefe de 1 de vida, só fora de produção):

```
PORT=2999 PGLITE_DIR=memory API_RATE_MULT=100 LOOT_TEST=1 LOOT_LOCK_S=3 BOSS_TEST=1 npm run start
SERVER=http://localhost:2999 npm run test:loot                             # 21 verificações
```

Regras de combate e grupo (regeneração, evade do inimigo, elegibilidade de XP e loot; servidor com `LOOT_TEST=1 LOOT_LOCK_S=3 ENEMY_LEASH_TEST=9`, que encurta a coleira para 9 tiles só fora de produção):

```
PORT=2999 PGLITE_DIR=memory API_RATE_MULT=100 LOOT_TEST=1 LOOT_LOCK_S=3 ENEMY_LEASH_TEST=9 npm run start
SERVER=http://localhost:2999 npm run test:combate -w @frixep/server        # 23 verificações
npm run test:boss:unit -w @frixep/server                                   # 21 verificações, sem servidor
```

Reinicie o servidor entre as suítes. No PowerShell: `$env:PORT=2999; $env:PGLITE_DIR="memory"; $env:API_RATE_MULT=100; $env:LOOT_TEST=1; npm.cmd run start`.
Saem com código 1 se qualquer verificação falhar. Veja também `docs/DEPLOY_SUPABASE_RENDER.md`.



## Deploy

`render.yaml` descreve os serviços do Render. Veja `docs/DEPLOY_SUPABASE_RENDER.md` (Parte 5).

## Servidor na sua máquina (Cloudflare Tunnel): atualizar e reiniciar

O servidor de jogo roda numa pasta própria, `FrixeP-servidor` (ao lado do projeto), **sempre na versão da `main`**, separada da pasta onde se desenvolve: trocar de branch ou editar código não derruba o jogo. O túnel (`cloudflared`, `api.frixep.com` para a porta 2567) é independente e não é tocado.

```
atualizar-servidor.cmd            (duplo clique, ou no terminal) baixa a main, instala o que mudou e reinicia
atualizar-servidor.cmd -Status    mostra se está de pé, a versão e o /health local e público
atualizar-servidor.cmd -Log -Seguir   acompanha o log (Ctrl+C sai; o servidor continua)
atualizar-servidor.cmd -Parar     para o servidor
```

O script (`tools/servidor.ps1`) cria a pasta na primeira vez (git worktree da `main`), faz `git fetch`, roda `npm ci` só quando o `package-lock.json` mudou, para a versão anterior (só o processo que ele mesmo iniciou, nunca o de terceiros), sobe em segundo plano com `NODE_ENV=production` e espera o `/health` responder. O log fica em `FrixeP-servidor\logs\servidor.log`. O `.env` é o da pasta principal do projeto e é passado ao Node sem ser lido nem impresso. Se a porta 2567 estiver ocupada por um servidor antigo aberto à mão, ele avisa e pede para fechá-lo.

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

## Instalar como app (PWA), ícones e tela do celular

- O jogo é um PWA: `packages/client/public/manifest.webmanifest` (tela cheia/standalone, paisagem, cores escuras) e `sw.js` (service worker mínimo: guarda só o shell e a arte estática; **nunca** API, WebSocket nem `assets/_manifest.json`; o jogo continua exigindo rede). Para invalidar o cache de todos, aumente `VERSION` em `sw.js`. O `render.yaml` dá cache curto a `sw.js` e ao manifest.
- No Android/Chrome/Brave aparece "Instalar app" no menu do jogo (botão ☰) quando o navegador permite; no iPhone, o mesmo botão mostra a dica "Compartilhar > Adicionar à Tela de Início". Instalado (tela cheia), o botão some.
- Ícones: `python tools/gen_icons.py` (Pillow) regenera `favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` em `packages/client/public/`.
- Tela do celular: `packages/client/src/viewport.ts` mede a altura realmente visível (`visualViewport`) e publica `--vh`; todos os painéis modais (baú, bolsa, mercado, ferreiro, troca, menu) usam essa altura, com cabeçalho fixo e rolagem interna. O canvas acompanha `resize`/`orientationchange`/`visualViewport.resize`; puxar-para-recarregar e zoom por duplo toque estão bloqueados.

## Travessia entre zonas e desempenho do cliente

- **Sem recarregar a página:** ao pisar num portal (ou ao reconectar/renascer) o cliente mostra na hora a tela de load dark fantasy (`packages/client/src/loading.ts`: nome do destino, dica, barra de brasa, fade suave, bloqueia entradas), sai da sala antiga e entra na da nova zona **em paralelo** ao fade, reaproveita atlas, texturas, HUD, mochila, chat e grupo, e só revela a tela quando o estado chegou, o personagem está posicionado e a câmera está centrada nele (`centerOn` + `startFollow` com lerp 1 no primeiro quadro; depois volta ao lerp 0,1).
- **Medição:** no modo dev, cada entrada imprime no console o tempo de cada etapa (`[travessia] ...`); o último resultado fica em `window.__frixepTravel`. Local: trabalho real da travessia ≈ 25-60 ms (limpeza ~2, mapa ~10, sala ~7, mundo ~3); a tela dura ~550 ms por conta do fade e de um mínimo de 450 ms para não piscar. O caminho antigo (`location.reload()`) refazia login, `/api/me`, manifest e 13 atlas em série.
- **FPS:** o chão da zona é desenhado uma vez numa textura em cache por zona (antes eram ~1600 losangos em Graphics reexecutados todo quadro: ~9,4 ms → ~6,9 ms por quadro na máquina de teste com GL por software); números de dano reaproveitados (pool), HUD só atualiza o DOM quando o valor muda, placas/nomes fora da tela não são desenhados, celular limita o DPR a 2 e desliga o antialias.
- Teste de 12 viagens seguidas: sem crescimento de objetos nem de texturas (`children` 186, texturas estáveis).
