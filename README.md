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
| 1 | Giro (área ao redor) | Perfurar (flecha que atravessa) | Cura (aliados num raio de 4) |
| 2 | Carga (avanço que machuca) | Cilada (armadilha no chão, até 3) | Brasa (aliados +25% de poder por 6 s) |
| 3 | Grito (reduz dano e provoca) | Chuva (área atingida após 0,8 s) | Reviver (levanta um aliado caído a até 8 tiles) |
| SHIFT | Esquiva (3 tiles) | Rolamento longo (5 tiles) | Esquiva (3 tiles) |

Mouse: a mira segue o ponteiro. Toque: a mira vai para o inimigo mais próximo.
Quem cai fica 8 s no chão antes de renascer no ponto inicial, o tempo que o Clérigo tem para reviver.
XP e loot são divididos entre todos os jogadores vivos a até 14 tiles de um abate, e cada um faz a sua rolagem.

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
npm run test:inv:unit                                              # regras do inventário, classes e banco, sem servidor (44 verificações)
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
