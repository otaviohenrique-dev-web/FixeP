# Backup e restauração do FrixeP

Este guia cobre três coisas: o backup diário, a restauração do banco e a restauração do repositório.
Os scripts ficam em `tools/` (`backup_espelho.ps1` e `backup_banco.ps1`).

> **Regra de ouro:** um backup que nunca foi restaurado não é confiável. Faça pelo menos uma restauração
> de teste (seção 4) e anote a data no `docs/PROGRESSO.md` (pendência PD-05).

---

## 1. O que é copiado

| O quê | Onde fica | Como é copiado |
|---|---|---|
| Código e histórico (todas as branches) | GitHub | Espelho local: `tools/backup_espelho.ps1` |
| Banco de dados (contas, personagens, itens) | Supabase | `tools/backup_banco.ps1` (`pg_dump`) e/ou backup automático do Supabase |
| Arte pesada (Git LFS) | GitHub LFS | Entra no espelho com `git lfs fetch --all` (ver seção 3) |
| Segredos (`.env`, senhas, chaves) | Não entram em backup de código | Guardados no **gerenciador de senhas** (seção 5) |

Não entram no backup: `node_modules/`, `.data/` (banco embutido de desenvolvimento) e `.env`.

---

## 2. Backup diário

### 2.1 Pré-requisitos (uma vez por máquina)

1. **Git for Windows** instalado (com `git` no PATH).
2. **Cliente PostgreSQL** (`pg_dump` e `psql`) instalado e no PATH. Confira no PowerShell:
   ```powershell
   pg_dump --version
   ```
   A versão deve ser igual ou maior que a do servidor Supabase.
3. **Variável `DATABASE_URL`** definida no ambiente do **seu usuário** do Windows (Painel de Controle > Sistema > Configurações avançadas > Variáveis de ambiente do usuário). Use a string de conexão que está no painel do Supabase, guardada no gerenciador de senhas. Ela **não** vai para o Git nem para o chat.
   Depois de definir, feche e abra o terminal.

### 2.2 Testar à mão

Execute na raiz do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File tools\backup_espelho.ps1 -Destino D:\Backup\FrixeP
powershell -ExecutionPolicy Bypass -File tools\backup_banco.ps1 -Destino D:\Backup\FrixeP-banco -Manter 14
```

- Os dois terminam com `SUCESSO:` (verde) ou `ERRO:` (vermelho), com o motivo.
- O espelho fica em `D:\Backup\FrixeP\FrixeP.git`.
- O banco gera `D:\Backup\FrixeP-banco\banco_AAAAMMDD_HHMMSS.dump`. Só os últimos `-Manter` arquivos são mantidos.

Use um disco diferente do que guarda o projeto (ex.: HD externo ou nuvem sincronizada). Backup na mesma máquina não protege contra perda do computador.

### 2.3 Agendar com o Agendador de Tarefas do Windows

Faça uma tarefa por script, diária (ex.: 03:00).

1. Abra **Agendador de Tarefas** > **Criar Tarefa...** (não "tarefa básica", para poder marcar a opção abaixo).
2. Aba **Geral**: nome `FrixeP - backup espelho`. Marque **Executar somente quando o usuário estiver conectado** (necessário para ler a `DATABASE_URL` do seu usuário).
3. Aba **Disparadores** > **Novo** > **Diariamente**, 03:00.
4. Aba **Ações** > **Novo** > **Iniciar um programa**:
   - Programa: `powershell.exe`
   - Argumentos:
     ```
     -NoProfile -ExecutionPolicy Bypass -File "E:\Projetos_Dev\FrixeP\tools\backup_espelho.ps1" -Destino "D:\Backup\FrixeP"
     ```
   - Iniciar em: `E:\Projetos_Dev\FrixeP`
5. Aba **Configurações**: marque **Se a tarefa falhar, reiniciar a cada** 10 min (até 3 vezes), e **Executar a tarefa o mais breve possível após uma inicialização agendada perdida**.
6. Repita para o banco, com os argumentos:
   ```
   -NoProfile -ExecutionPolicy Bypass -File "E:\Projetos_Dev\FrixeP\tools\backup_banco.ps1" -Destino "D:\Backup\FrixeP-banco" -Manter 14
   ```
   Agende 03:30, para não coincidir com o espelho.

Para conferir: clique na tarefa > **Executar**, e veja a coluna **Resultado da última execução** (0x0 = sucesso). A cada semana, abra a pasta de backup e confirme que há arquivos com data recente.

### 2.4 Backups do Supabase (complemento)

O Supabase também guarda backups do banco (os recursos e a retenção dependem do plano; veja no painel do projeto, em **Database > Backups**). Eles **não substituem** o `pg_dump` local: se a conta do Supabase for perdida, o backup de lá vai junto. Use os dois.

---

## 3. Restaurar o banco num banco de teste

**Nunca** restaure por cima do banco de produção para testar. Use um banco de teste separado (ex.: um projeto Supabase de teste, ou um PostgreSQL local em Docker).

### 3.1 Restaurar a partir do `.dump` (formato custom)

```powershell
# Use a URL do BANCO DE TESTE (guardada no gerenciador de senhas), nunca a de produção.
$env:TESTE_URL = '<cole a URL do banco de teste aqui; não salve este comando>'
pg_restore --no-owner --no-acl --clean --if-exists --dbname="$env:TESTE_URL" "D:\Backup\FrixeP-banco\banco_AAAAMMDD_HHMMSS.dump"
Remove-Item Env:TESTE_URL
```

- `--clean --if-exists` apaga os objetos do banco de teste antes de recriar. Por isso o destino tem que ser o de teste.
- Erros de `already exists` ou de `role` costumam ser inofensivos com `--no-owner --no-acl`.

### 3.2 Conferir a restauração

Abra o banco de teste com `psql` (ou o SQL editor do Supabase) e confira:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;
```

Depois conte alguns registros e compare com produção (ordem de grandeza, não precisa ser igual se houve jogo depois do backup):

```sql
SELECT count(*) FROM <tabela_de_personagens>;
```

Se as tabelas aparecem e os números fazem sentido, a restauração funcionou. Anote a data do teste no `docs/PROGRESSO.md` e marque a PD-05 como resolvida.

### 3.3 Restaurar só com `psql` (arquivo `.sql`)

Se quiser um arquivo SQL puro, gere-o a partir do `.dump`:

```powershell
pg_restore --no-owner --no-acl -f "D:\Backup\teste.sql" "D:\Backup\FrixeP-banco\banco_AAAAMMDD_HHMMSS.dump"
psql "$env:TESTE_URL" -f "D:\Backup\teste.sql"
```

### 3.4 Teste de restauração sem pg_dump (Node)

Alternativa que roda **sem** instalar o cliente PostgreSQL: `tools/backup_restore_teste.mjs`, feito só com Node e as bibliotecas do próprio projeto (`pg` e PGlite).

```powershell
node --env-file=E:\Projetos_Dev\FrixeP\.env tools\backup_restore_teste.mjs
```

O script faz, nesta ordem:

1. **Backup de produção, só leitura:** lê cada tabela de `public` numa transação `read only` (apenas `SELECT`) e grava um `.json` por tabela e um `manifesto.json` em `E:\Projetos_Dev\FrixeP-backups-banco\backup_AAAA-MM-DD-HH-MM-SS\` (fora do Git).
2. **Restauração num banco de teste descartável:** cria um PGlite temporário com as migrações de `packages/server/migrations` e carrega os JSON nele.
3. **Comparação:** para cada tabela, conta as linhas e calcula um checksum (md5 do conteúdo) na origem e no restaurado. Imprime `OK` ou `DIFERENÇA`, só com nomes de tabela e contagens.
4. **Servidor:** sobe o servidor na porta **2599** apontando para o banco restaurado e confere se `/health` responde e se o log mostra `[db] conectado (pglite)`.

Segurança: a `DATABASE_URL` é lida só do ambiente e nunca é impressa. O `.env` não é aberto pelo script, só repassado pelo `--env-file`.

Limitações deste teste:

- Não gera um `.dump` do `pg_dump`. Ele prova que os **dados** voltam íntegros e que o schema das migrações aceita os dados, mas não testa o formato oficial de backup do Supabase.
- O restaurado é um PGlite (PostgreSQL embutido), não um PostgreSQL de servidor. Diferenças de extensão ou de versão do Postgres não aparecem aqui.
- O servidor sobe em modo de desenvolvimento, porque em `NODE_ENV=production` ele exige `DATABASE_URL`.
- Não testa o `pg_restore` nem o `psql` do guia (seções 3.1 a 3.3).

Para fechar a PD-05 com o procedimento oficial, instale o cliente PostgreSQL (uma vez):

```powershell
winget install --id PostgreSQL.PostgreSQL.17 --override "--mode unattended --enable-components commandlinetools --disable-components server pgAdmin stackbuilder"
```

A versão do cliente deve ser igual ou maior que a do servidor Supabase. Depois, use as seções 2.2 e 3.1.

---

## 4. Restaurar o repositório a partir do espelho

O espelho (`FrixeP.git`) é um repositório "nu" com todo o histórico. Para trabalhar a partir dele:

### 4.1 Clonar o espelho (restauração completa)

```powershell
git clone "D:\Backup\FrixeP\FrixeP.git" "E:\Projetos_Dev\FrixeP-restaurado"
cd "E:\Projetos_Dev\FrixeP-restaurado"
git branch -a
```

Depois, para voltar a apontar para o GitHub (quando ele estiver de volta):

```powershell
git remote set-url origin https://github.com/otaviohenrique-dev-web/FixeP.git
```

### 4.2 Enviar o espelho de volta ao GitHub (só em emergência)

Se o GitHub perdeu o repositório, crie um repositório vazio nele e envie o espelho inteiro:

```powershell
git -C "D:\Backup\FrixeP\FrixeP.git" push --mirror https://github.com/<seu-usuario>/<repo-novo>.git
```

`push --mirror` substitui todas as branches e tags do destino. Use **só** em repositório novo e vazio, e **nunca** use `--force` num repositório que já tem trabalho sem antes explicar o risco e pedir confirmação.

### 4.3 Arte pesada (Git LFS)

O espelho não traz automaticamente os arquivos grandes. Para trazê-los:

```powershell
cd "E:\Projetos_Dev\FrixeP-restaurado"
git lfs fetch --all
git lfs checkout
```

Requer `git lfs install` feito uma vez na máquina.

---

## 5. Onde guardar segredos

- **Gerenciador de senhas** (ex.: Bitwarden, 1Password, Gerenciador do Google): guarde aqui a `DATABASE_URL` do Supabase, a `JWT_SECRET` de produção, as chaves do Google/Discord, a senha da conta GitHub e do Supabase, e os códigos de recuperação de dois fatores.
- **Nunca** no Git, em arquivos do projeto, em prints, no chat com o Claude ou em notas soltas.
- O `.env` fica só na sua máquina e está no `.gitignore`. Se ele vazar, troque as chaves (não basta apagar o arquivo).
- Os scripts de backup **não leem** o `.env`: eles usam só a variável `DATABASE_URL` do usuário.
- Se um segredo aparecer por engano em um commit, considere-o vazado: troque-o imediatamente. Apagar o commit não basta.

---

## 6. Checklist mensal

- [ ] Tarefas do Agendador rodaram (coluna "Resultado da última execução" = 0x0).
- [ ] Pasta de backup tem arquivos recentes (espelho atualizado, `.dump` dos últimos dias).
- [ ] Uma vez por mês: restauração de teste da seção 3 feita com sucesso.
- [ ] Gerenciador de senhas tem a `DATABASE_URL` e os códigos de recuperação atualizados.
