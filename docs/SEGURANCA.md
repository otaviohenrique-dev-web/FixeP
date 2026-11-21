# Segurança: rotacionar segredos e validar o banco

Este guia é para **você** fazer. A IA (assistente de código) **não rotaciona senhas nem chaves**, não acessa o painel
do Supabase, do Render ou do Google, e **não vê** nenhum segredo: nem a senha do banco, nem a `DATABASE_URL`,
nem o conteúdo do `.env`. Quando precisar de ajuda, cole aqui só o **nome** da variável e a mensagem de erro,
nunca o valor.

> Os nomes exatos de menus e botões dos painéis (Supabase, Render, Google) mudam de tempo em tempo.
> Se não encontrar um item, procure pelo termo entre aspas ou pela documentação oficial do provedor.

## Antes de começar

- Tenha à mão acesso ao painel do **Supabase** (projeto do FrixeP), ao painel do **Render** (serviço `frixep-server`)
  e ao **Google Cloud Console** (cliente OAuth de produção), se o login com Google estiver ativo.
- Escolha um momento sem jogadores conectados (a troca de senha derruba o servidor por alguns minutos).
- Use um gerenciador de senhas para guardar os valores novos. **Não** os cole em chat, e-mail, issue, PR nem em arquivos do repositório.

## Passo 1. Trocar a senha do banco (Supabase)

1. Supabase → seu projeto → **Project Settings → Database**.
2. Procure **Reset database password** (ou "Database password"). Gere uma senha nova e forte.
3. Guarde a senha no gerenciador de senhas. Ela **não** aparece de novo depois.
4. A string de conexão (`DATABASE_URL`) contém essa senha. Você terá de atualizá-la nos passos 3 e 4.
   Ela continua no formato do **Session pooler** do Supabase (ver `docs/DEPLOY_SUPABASE_RENDER.md`, Parte 1).

## Passo 2. Revogar as chaves antigas do Supabase

1. Supabase → **Project Settings → API Keys** (ou "API").
2. Crie as chaves novas que o projeto usar (ex.: a chave `service_role`/secreta, se existir).
3. Confirme que o FrixeP **não usa** chave de API do Supabase para o banco: o servidor conecta por `DATABASE_URL`
   (ver `docs/DEPLOY_SUPABASE_RENDER.md`, Parte 2). Por isso, **desative ou revogue** a chave antiga assim que as novas estiverem
   em uso (se alguma coisa ainda depender dela, o painel mostra; resolva antes de revogar).
4. Anote, no seu gerenciador, a data em que revogou a chave antiga.

## Passo 3. Atualizar a variável no Render

1. Render → serviço **frixep-server** → **Environment**.
2. Edite `DATABASE_URL` e cole a string nova (com a senha nova). Salve.
3. Confira `DATABASE_CA` (certificado do banco, ver Parte 3 do guia de deploy). Se estiver vazia, preencha
   com o certificado do Supabase: **Project Settings → Database → SSL Configuration**.
4. Confira `NODE_ENV=production` e que **não** existe `DB_SCHEMA` nem `ALLOW_GUEST`.
5. Clique em **Manual Deploy → Deploy latest commit** para o servidor subir com os valores novos.
   O Render não reinicia sozinho ao mudar variáveis em todos os casos.

## Passo 4. Atualizar a máquina do servidor (se você roda um servidor local ligado ao banco de produção)

1. No seu `.env` local (arquivo na raiz do projeto, que o Git ignora), troque `DATABASE_URL` pela string nova.
   **Faça isso você mesmo, no editor**; não cole o valor no chat.
2. Se usar `DATABASE_CA` na máquina, aponte para o arquivo `.pem` (caminho) ou cole o PEM na variável de ambiente
   do usuário. Não grave o certificado dentro do repositório.
3. Reinicie o servidor (`npm.cmd run dev:server` ou `atualizar-servidor.cmd`) e confira o log: deve aparecer
   `[db] conectado (postgres)`.
4. Se a máquina tiver backups agendados (`tools/backup_banco.ps1`), a `DATABASE_URL` da sessão do agendador também precisa
   ser atualizada (Painel de Tarefas, variáveis do usuário ou do sistema).

## Passo 5. Revogar a chave antiga (confirmação)

- Supabase: confirme que a senha antiga não entra mais. Pelo próprio painel, a senha antiga já não existe depois do passo 1.
- Chaves de API antigas: já revogadas no passo 2.
- Limpe clipes ou arquivos temporários que tenham recebido a senha antiga (ex.: um `.env` copiado para outra pasta).

## Passo 6. Validar a conexão

1. Abra no navegador o endereço do servidor de produção seguido de `/health`
   (ex.: `https://frixep-server.onrender.com/health`). A resposta deve ser OK (sem erro).
   Se demorar, é o servidor acordando no plano gratuito do Render; espere e tente de novo.
2. No log do Render, procure `[db] conectado (postgres)` e **não** procure `[db] DATABASE_CA não definido`.
   Se o aviso aparecer, a variável `DATABASE_CA` não está definida ou está vazia.
3. Entre no jogo (cliente de produção) com um personagem de teste e faça uma ação que salve (ex.: ganhar XP).
   Recarregue a página e confirme que o personagem continua igual.
4. Se `/health` falhar com erro de senha ou de certificado, **não** volte a senha antiga. Confira a `DATABASE_URL`
   (copiada inteira, sem espaço no começo ou no fim) e o `DATABASE_CA`. Corrija e faça o deploy de novo.
5. Quando tudo estiver certo, marque a data em `docs/PROGRESSO.md` (pendência **PD-06**).

## Passo 7. Limpar contas de convidado de teste (opcional, recomendado antes de abrir ao público)

O script `tools/limpar_convidados.ps1` apaga contas de convidado sem atividade há N dias (padrão 7).

```powershell
powershell -ExecutionPolicy Bypass -File tools\limpar_convidados.ps1 -Dias 7
```

Sem `-Executar` ele **só simula**: mostra quantas contas e personagens seriam apagados e não apaga nada.
Para apagar de verdade, rode com `-Executar` depois de conferir a simulação. A exclusão é irreversível.
O script usa a `DATABASE_URL` que estiver definida **na sessão** do terminal; ele não lê o `.env`. Defina a variável
de forma temporária na sessão ou use o ambiente do usuário, e rode só contra o banco certo.

## Checklist de segredos

Confira cada item. Os valores ficam **fora** do repositório e fora de conversas.

| Segredo | Onde fica | Quando trocar | Feito? |
|---|---|---|---|
| Senha do banco (`DATABASE_URL`) | Render, `.env` local, agendador de backup | Já exposta: trocar agora (passos 1 e 3) | ☐ |
| Chaves de API do Supabase | painel do Supabase | Revogar as antigas (passo 2) | ☐ |
| `DATABASE_CA` | Render e máquina (caminho ou PEM) | Ao trocar o certificado do Supabase | ☐ |
| `JWT_SECRET` | Render (gerado pelo Render) e `.env` local | Se vazar. Trocar invalida os logins ativos | ☐ |
| Google (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) | Render | Se o secret vazar: crie novo cliente OAuth em produção | ☐ |
| Discord (se usado) | Render | Se o secret vazar: regenere no portal de desenvolvedores do Discord | ☐ |

Regras gerais:

- Produção e desenvolvimento usam **segredos diferentes** (inclusive `JWT_SECRET`).
- Nunca faça commit de `.env`, `.data/` ou `node_modules/`. Antes de cada commit, confira `git status`.
- Nunca grave senha em arquivo versionado, em nome de branch, em mensagem de commit ou em log do servidor.

## Se algo vazar

1. **Não entre em pânico e não espere.** Troque o segredo vazado no painel do provedor, imediatamente (passos acima).
2. Se foi a senha do banco ou uma chave do Supabase: troque e revogue as antigas. Depois confira, em
   Supabase → **Logs** / **Reports**, se houve acesso estranho ao banco.
3. Se foi `JWT_SECRET`: troque no Render e faça deploy. Os jogadores precisarão entrar de novo.
4. Se foi um segredo do Google ou do Discord: regenere no painel do provedor e atualize no Render.
5. Se o segredo foi para o **Git** (commit ou PR): trocar o valor é obrigatório. Apagar o commit não basta,
   porque o histórico pode ter sido copiado. Avise quem for necessário e registre o ocorrido em `docs/PROGRESSO.md`.
6. Anote o que vazou, quando, onde e o que foi feito, sem colar o valor vazado em lugar nenhum.

## Relação com outros guias

- `docs/DEPLOY_SUPABASE_RENDER.md`: como montar o banco e o Render (inclui a Parte 3, `DATABASE_CA`).
- `docs/BACKUP_RESTAURACAO.md`: backup antes de qualquer mudança grande no banco.
- `docs/PROGRESSO.md`: pendência **PD-06** (rotação ainda não feita).
