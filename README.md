# FrixeP

MMO RPG 2D isométrico dark fantasy (navegador). Phaser 3 + Colyseus + PostgreSQL/Redis.

## Rodar (F0)

```
npm install
npm run dev:server   # ws://localhost:2567
npm run dev:client   # http://localhost:5173
```

Abra duas abas: os jogadores aparecem andando no mapa (clique para mover).

## Controles de combate (Guerreiro)

| Ação | Tecla | Botão na tela |
|---|---|---|
| Golpe | ESPAÇO | Golpe |
| Giro (área) | 1 | Giro |
| Carga (avanço) | 2 | Carga |
| Grito (reduz dano e provoca) | 3 | Grito |
| Esquiva (invulnerável por instantes) | SHIFT | Esquiva |

Mouse: a mira segue o ponteiro. Toque: a mira vai para o inimigo mais próximo.

## Teste anti-trapaça

Suíte que age como cliente malicioso (token forjado, speed hack, spam de skills, dano injetado,
payloads malformados, flood, adulteração do estado local). Rode contra um servidor de teste
(porta diferente da do jogo) a partir de `packages/server`:

```
PORT=2999 PGLITE_DIR=memory API_RATE_MULT=100 npm run start        # terminal 1 (banco em memória)
SERVER=http://localhost:2999 npm run test:cheat                    # terminal 2: anti-trapaça (25 verificações)
SERVER=http://localhost:2999 npm run test:persist                  # terminal 2: contas, personagem e XP (32 verificações)
```

No PowerShell: `$env:PORT=2999; $env:PGLITE_DIR="memory"; $env:API_RATE_MULT=100; npm.cmd run start`.
Saem com código 1 se qualquer verificação falhar. Veja também `docs/DEPLOY_SUPABASE_RENDER.md`.


