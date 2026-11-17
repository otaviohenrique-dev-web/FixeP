# FrixeP: contexto para assistentes de IA

> **Este é um projeto que JÁ EXISTE.** Nunca crie um projeto novo, nunca pergunte qual stack ou tipo de aplicação
> usar (React, Next.js, Python...) e nunca use assistentes de "criação/configuração de projeto". Trabalhe sempre
> sobre este repositório: https://github.com/otaviohenrique-dev-web/FixeP

## O que é
MMO RPG 2D isométrico de fantasia sombria, jogado no navegador (computador e celular). Servidor autoritativo:
o cliente envia só intenções (mover, usar ação) e o servidor decide todos os resultados.

## Tecnologia
- **Cliente:** TypeScript, Phaser 3, Vite (`packages/client`)
- **Servidor:** Node.js, Colyseus, Express (`packages/server`)
- **Compartilhado:** regras e tipos usados pelos dois (`packages/shared`)
- **Banco:** PostgreSQL. Sem `DATABASE_URL` o servidor usa um banco embutido (PGlite, pasta `.data/`); em produção, Supabase.
- **Deploy:** servidor no Render, banco no Supabase (veja `docs/DEPLOY_SUPABASE_RENDER.md`).

## Estrutura
```
assets/      toda a arte (characters, monsters, npcs, tiles, props, ui, fx, cosmetics, source)
docs/        guias (ART_GUIDE.md, DEPLOY_SUPABASE_RENDER.md, SETUP_DEV_ARTE.pdf)
packages/    client/  server/  shared/   (código)
```

## Comandos (Windows)
No PowerShell use **`npm.cmd`** no lugar de `npm` (o PowerShell bloqueia scripts).
```
npm.cmd install            # instalar dependências (raiz do projeto)
npm.cmd run dev:server     # servidor em http://localhost:2567
npm.cmd run dev:client     # cliente em  http://localhost:5173
npm.cmd run typecheck      # confere os tipos de todos os pacotes
```
Para jogar em desenvolvimento: abrir http://localhost:5173, "Jogar como convidado", criar personagem (3 classes:
Guerreiro, Arqueiro, Clérigo).

## Ambiente local
Arquivo `.env` na raiz (ignorado pelo Git). Para desenvolvimento bastam 3 linhas, que **não são segredos**:
```
JWT_SECRET=qualquer-texto-longo-so-para-desenvolvimento-local-123456
SERVER_URL=http://localhost:2567
CLIENT_URL=http://localhost:5173
```
Não é preciso Google, Discord nem Supabase para desenvolver.

## Git
- A branch **`main` é protegida**: ninguém envia direto. Todo trabalho vai por **branch própria + Pull Request**.
- Nomes de branch: `feat/...` (código), `art/...` (arte), `docs/...` (documentação).
- Nunca use `git push --force`, `git reset --hard` ou `git clean` sem explicar o risco e pedir confirmação.
- Arquivos de arte pesados (`.psd`, `.aseprite`, PNG em `assets/`, `.wav`...) ficam no **Git LFS** (`git lfs install` uma vez por máquina).

## Segurança
- Nunca peça, leia, imprima ou grave senhas, tokens, chaves de API ou o conteúdo de `.env`.
- Nunca faça commit de `.env`, `.data/` ou `node_modules/`.
- O login no GitHub é feito pela própria pessoa, no navegador.

## Papéis
- **Dev principal:** código em `packages/`, banco, deploy e a integração da arte no jogo.
- **Dev de arte:** toda a arte em `assets/` (e `docs/ART_GUIDE.md`). Não altera `packages/`; se precisar de mudança no código, abre uma Issue.

## Especificações de arte (resumo; completo em `docs/ART_GUIDE.md`)
- Pixel art. Tile isométrico **64 x 32 px**. Personagens em quadro de **64 x 64 px**.
- Direções: **decidido (17/11/2026) começar com 4 diagonais** (desenhar SE e NE; o jogo espelha SW e NW). As 8 direções (5 desenhadas + 3 espelhadas) entram depois, no marco M8 de `docs/GUIA_ARTE_INICIAL.pdf`.
- Entrega: PNG com transparência + JSON de atlas no formato do Phaser; atlas de no máximo **2048 x 2048 px**.
- Nomes de arquivo em minúsculas, com sublinhado, sem acento nem espaço (ex.: `warrior_walk_se_00.png`).
- Finais em `assets/<categoria>/`; editáveis (`.aseprite`, `.psd`) em `assets/source/`.
- Ícones de item: `item_<id>.png` (48 x 48 px). Sem iluminação pintada no sprite (dia e noite são feitos por código).

## Testes (dev principal)
Suítes em `packages/server/test/` (anti-trapaça, persistência, inventário, classes). Instruções no `README.md`.
