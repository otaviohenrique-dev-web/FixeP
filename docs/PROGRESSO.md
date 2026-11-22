# Progresso do Guia de Metodologia FrixeP

Fonte: `docs/GUIA_METODOLOGIA_FRIXEP.pdf` (trilha Cru primeiro, Polimento depois). Atualize este arquivo no PR de cada card.
Legenda: ✅ concluído · 🟡 concluído com pendência · ⬜ a fazer. Criticidade das pendências: **Alta** (bloqueia ou arrisca jogadores/dados), **Média** (atrapalha o trabalho), **Baixa** (incômodo).

## Etapa C0 · Fundação (marco v0.1)

| Card | Situação | Observação |
|---|---|---|
| C0.1 Testes antigos e CI | 🟡 concluído (2026-11-21) | 26 suítes passam localmente; CI no GitHub Actions criado; falhas intermitentes tratadas com 1 repetição (ver pendências). |
| C0.2 Backup e espelho | 🟡 scripts e guia prontos (2026-11-21) | `tools/backup_espelho.ps1` e `tools/backup_banco.ps1` prontos; guia em `docs/BACKUP_RESTAURACAO.md`. Falta o usuário rodar uma restauração de teste (PD-05). |
| C0.3 Servidor em VPS no Brasil | ⬜ | |
| C0.4 Chave antiga revogada; conexão ao banco validada | 🟡 código, script e guia prontos (2026-11-21) | `DATABASE_CA` no servidor (PEM ou caminho de arquivo); `tools/limpar_convidados.ps1` (simula por padrão); guia `docs/SEGURANCA.md`. Falta o usuário rotacionar as chaves e validar `/health` (PD-06). |
| C0.5 Telemetria mínima | 🟡 concluído com pendência (2026-11-21) | Tabela `eventos` (migração 010), `registrarEvento` (nunca lança), eventos login, criação, 1º abate, nível 5 e saída; `tools/funil_7dias.sql`; seção no README. Testes: `test/telemetria.unit.ts` (14 verificações), persistence e cidade passam com o servidor. Pendência **Média**: os eventos do servidor de verdade não são lidos de volta pelos testes (não há leitura de banco no servidor de teste); `passo_tutorial` fica pronto mas não é gerado, porque o tutorial ainda não existe. |
| C0.6 Moderação mínima | 🟡 concluído com pendência (2026-11-21) | Migração `011_moderacao.sql` (tabelas `sancoes` e `denuncias`); admin por `ADMIN_ACCOUNT_IDS`; comandos `/silenciar`, `/banir`, `/desbanir` e `/denuncias`; botão Denunciar no menu do jogador; eventos de telemetria `denuncia`, `silenciado`, `banido`. Testes: `test/moderacao.unit.ts` e `test/moderacao.mjs`. Pendência **Média**: não há tela de moderação; o admin usa só os comandos de chat e `/denuncias` não marca denúncia como resolvida. |

## Etapa C1 · Quests e tutorial

| Card | Situação | Observação |
|---|---|---|
| C1.1 Motor de quests orientado a dados | 🟡 concluído com pendência (2026-11-21) | Quests em JSON (`packages/server/data/quests/`, validadas na carga); tabela `quest_estado` (migração `012_quests.sql`); mensagens `quest_aceitar`, `quest_entregar`, `quest_falar`, `quest_sync` e evento `quest_estado`; entrega numa transação (recompensa e estado juntos); telemetria `quest_aceita` e `quest_entregue`. Quest de teste: Caça aos Ossos. Testes: `test/quests.unit.ts` (42 verificações) e `test/quests.mjs` (16, com servidor `QUEST_TEST=1`). Pendência **Média** PD-07. |
| C1.2 Diálogo de NPC | ⬜ | Depende do C1.1 (a conversa chama `quest_falar`). |
| C1.3 Diário de quests | ⬜ | Depende do C1.1. Hoje o cliente só recebe o estado e não mostra nada. |
| C1.4 Tutorial | ⬜ | Depende do C1.1 e do C1.2. |
| C1.5 Quests 1 a 10 | ⬜ | Depende do C1.1 (conteúdo em JSON). |

## Pendências abertas

| ID | Pendência | Criticidade | Detalhe e próximo passo |
|---|---|---|---|
| PD-01 | `classes.mjs` intermitente no CI | **Média** | No GitHub (2 CPUs) o Arqueiro às vezes não derruba o esqueleto a tempo (o esqueleto volta a "idle" longe do Arqueiro). Passa sempre no PC, mesmo com CPU sobrecarregada. O `run-all.sh` repete a suíte 1 vez e marca FLAKY. Corrigir: tornar o teste independente de tempo (ex.: esperar o abate por evento) e remover a dependência da repetição. |
| PD-02 | `guerreiro.mjs` e `party.mjs` também intermitentes no CI | **Média** | `guerreiro.mjs` falhou na 1ª tentativa e passou na repetição (mesmo padrão da PD-01). `party.mjs` também ficou intermitente no CI e passou só na repetição. `loot.mjs` falhava de forma fixa no GitHub porque o Clérigo ficava longe do chefe; já corrigido. Tornar `guerreiro.mjs` e `party.mjs` independentes de tempo. |
| PD-05 | Restauração do banco ainda não testada pelo usuário | **Alta** | Os scripts de backup e o guia `docs/BACKUP_RESTAURACAO.md` estão prontos, mas nenhuma restauração foi feita num banco de teste. Próximo passo: rodar a seção 3 do guia num banco de teste e anotar a data aqui. |
| PD-06 | Rotação da chave exposta do Supabase ainda não feita pelo usuário | **Alta** | A IA não rotaciona segredos nem os vê. Próximo passo: seguir `docs/SEGURANCA.md` (senha do banco, chaves do Supabase, Render, máquina do servidor), revogar a chave antiga e validar `/health`. Anote a data aqui. |
| PD-07 | Abate real de inimigo não é testado de ponta a ponta nas quests | **Média** | O `test/quests.mjs` avança os abates pelo atalho `quest_teste_abate` (só com `QUEST_TEST=1`), que chama a mesma função do abate de verdade (`questAbate`). Falta um teste que mate esqueletos em combate real e confira a quest. Próximo passo: adicionar isso junto com o C1.2. |
| PD-03 | Cobertura de CI só do servidor | **Baixa** | O cliente (Phaser/Vite) só passa pelo typecheck; não há teste automático de interface. Avaliar após a etapa C1. |
| PD-04 | Servidores de teste esquecidos no Windows | **Baixa** | O `run-all.sh` agora encerra a árvore de processos; se uma rodada for interrompida à força, restam processos `tsx src/index.ts`. Encerre-os pelo Gerenciador de Tarefas. |

Regra: pendência **Alta** não passa de marco; **Média** deve ser resolvida até o fim da etapa seguinte; **Baixa** entra quando houver folga.
