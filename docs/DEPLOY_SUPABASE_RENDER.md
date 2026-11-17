# Banco de dados no Supabase e servidor no Render (passo a passo)

Desde a F2 o servidor guarda **contas e personagens** em PostgreSQL. Em desenvolvimento ele usa um banco embutido
(PGlite, arquivo em `.data/`, ignorado pelo Git). Em produção ele usa o **Supabase** quando a variável
`DATABASE_URL` está definida. O código e as migrações são os mesmos nos dois.

> **Regra de ouro:** a string de conexão contém a senha do banco. Ela vai só no `.env` (que o Git ignora)
> e nas variáveis de ambiente do Render. **Nunca** em chat, commit, print ou documento.

## Parte 1. Criar o banco no Supabase

1. Abra https://supabase.com/dashboard e clique em **New project**.
2. Preencha:
   - **Name:** `frixep`
   - **Database password:** use o botão *Generate a password* e guarde no seu gerenciador de senhas.
   - **Region:** `South America (São Paulo)`, para ficar perto dos jogadores e do servidor.
3. Clique em **Create new project** e espere uns 2 minutos até ficar pronto.
4. Clique no botão **Connect** (topo da página do projeto) e escolha **Session pooler**.
   - Use o *Session pooler* (porta **5432**): funciona em IPv4, que é o que o Render usa, e serve para servidores
     que ficam sempre ligados, como o nosso.
   - Evite a *Direct connection* (só IPv6) e o *Transaction pooler* (porta 6543, feito para funções sem estado).
5. Copie a URI. Ela parece com:
   `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
   e troque `[YOUR-PASSWORD]` pela senha do passo 2. Se a senha tiver símbolos como `@`, `#` ou `/`, é preciso
   codificá-los (por exemplo `@` vira `%40`). Gerar uma senha só com letras e números evita o problema.

## Parte 2. Testar no seu computador

1. No `.env` da raiz do projeto, acrescente (sem aspas):
   ```
   DATABASE_URL=postgresql://postgres.SEU_REF:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
2. Rode o servidor (`npm.cmd run dev:server`). Na primeira vez deve aparecer:
   ```
   [db] migração aplicada: 001_init.sql
   [db] conectado (postgres)
   ```
3. No Supabase, abra **Table Editor**: devem existir as tabelas `accounts`, `characters` e `schema_migrations`.
4. Abra **Advisors → Security**: não deve haver aviso de "RLS disabled". As tabelas já nascem com
   *Row Level Security* ligado e sem políticas, o que **fecha** a API REST pública do Supabase para elas
   (a chave `anon` é pública; sem isso qualquer pessoa leria e alteraria os dados). O nosso servidor conecta como
   dono do banco e não é afetado pelo RLS.

## Parte 3. Certificado do banco (recomendado em produção)

Sem isso o servidor conecta com TLS **sem verificar o certificado** (e avisa no log).

1. Supabase → **Project Settings → Database → SSL Configuration** → baixe o certificado.
2. Abra o arquivo `.crt` num editor de texto e copie **todo** o conteúdo (de `-----BEGIN CERTIFICATE-----`
   até `-----END CERTIFICATE-----`).
3. No Render, crie a variável `DATABASE_CA` com esse conteúdo (campo multilinha).

## Parte 4. Variáveis no Render (serviço do servidor)

Em **Environment** do serviço, defina:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | texto longo e aleatório (32+ caracteres), **diferente** do de desenvolvimento |
| `DATABASE_URL` | a string do Session pooler (Parte 1) |
| `DATABASE_CA` | o certificado (Parte 3) |
| `SERVER_URL` | URL pública do servidor, ex.: `https://frixep-server.onrender.com` |
| `CLIENT_URL` | URL pública do cliente (a do site do jogo) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | as credenciais do Google (use uma chave **nova** em produção) |

Outros pontos:

- **Comando de início:** use `npm run start:prod -w @frixep/server`. O script `start` lê o arquivo `.env`, que não
  existe no Render e faria o servidor falhar.
- **Health check path:** `/health`.
- **Google OAuth:** no console do Google, adicione a URI de redirecionamento de produção
  `https://SEU-SERVIDOR/auth/google/callback` ao cliente OAuth.
- **Cliente (site):** defina `VITE_API_URL` com a URL do servidor (o endereço `wss://` é derivado sozinho).
- **Plano do Render:** o plano gratuito **desliga o serviço após ~15 min sem uso** e leva cerca de um minuto para
  voltar, derrubando todas as conexões do jogo. Para jogar de verdade use um plano pago (Starter).
- A conta **convidada** fica desligada em produção (só funciona com `ALLOW_GUEST=1`).

## O que muda para o jogador

Depois do login, quem ainda não tem personagem vê a tela **Crie seu Portador** (nome de 3 a 16 caracteres e
classe). Cada conta tem **1 personagem**; o nome é único (não diferencia maiúsculas nem acentos). Nível e XP são
salvos ao sair, ao subir de nível e a cada 30 segundos.

## Migrações

Arquivos em `packages/server/migrations/*.sql`, aplicados em ordem na inicialização, cada um numa transação.
Para mudar o banco, **crie um arquivo novo** (`002_...sql`); nunca edite um já aplicado.

## Testar contra o Supabase sem sujar o banco real

As suítes de teste criam dezenas de contas e personagens. Para **não misturar** isso com dados de verdade, rode-as num
**schema separado** (`DB_SCHEMA`), dentro do mesmo banco. O schema real (`public`) não é tocado.

```
# em packages/server, com a DATABASE_URL já no .env
PORT=2999 DB_SCHEMA=frixep_test API_RATE_MULT=100 LOOT_TEST=1 npm run start      # terminal 1 (servidor de teste)
SERVER=http://localhost:2999 npm run test:persist                                # terminal 2 (e test:inv, test:classes, test:cheat)

node --env-file=../../.env test/remote-db.mjs status    # contagens do schema real e do de teste
node --env-file=../../.env test/remote-db.mjs drop      # apaga SÓ o schema de teste (recusa o "public")
```

`DB_SCHEMA` é ignorado em produção (o servidor se recusa a iniciar com ele quando `NODE_ENV=production`).
Resultado em 17/11/2026 no Supabase (Oregon): persistência 34/34, inventário 16/16, classes 34/34 e anti-trapaça 25/25;
o teste de 12 criações simultâneas gerou exatamente 1 personagem com conexões reais.

**Antes de abrir o jogo ao público:** contas de convidado (`provider = 'guest'`) só existem em desenvolvimento
(`ALLOW_GUEST` fica desligado em produção). Apague as de teste do schema `public`, se houver, e defina `DATABASE_CA`.
