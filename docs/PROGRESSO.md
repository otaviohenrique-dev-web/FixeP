# Progresso do Guia de Metodologia FrixeP

Fonte: `docs/GUIA_METODOLOGIA_FRIXEP.pdf` (trilha Cru primeiro, Polimento depois). Atualize este arquivo no PR de cada card.
Legenda: ✅ concluído · 🟡 concluído com pendência · ⬜ a fazer. Criticidade das pendências: **Alta** (bloqueia ou arrisca jogadores/dados), **Média** (atrapalha o trabalho), **Baixa** (incômodo).

## Etapa C0 · Fundação (marco v0.1)

| Card | Situação | Observação |
|---|---|---|
| C0.1 Testes antigos e CI | 🟡 concluído (2026-11-21) | 26 suítes passam localmente; CI no GitHub Actions criado; falhas intermitentes tratadas com 1 repetição (ver pendências). |
| C0.2 Backup e espelho | 🟡 scripts e guia prontos (2026-11-21) | `tools/backup_espelho.ps1` e `tools/backup_banco.ps1` prontos; guia em `docs/BACKUP_RESTAURACAO.md`. Falta o usuário rodar uma restauração de teste (PD-05). |
| C0.3 Servidor em VPS no Brasil | ⬜ | |
| C0.4 Segurança (chave, DATABASE_CA, contas de teste) | ⬜ | |
| C0.5 Telemetria mínima | ⬜ | |
| C0.6 Moderação mínima | ⬜ | |

## Pendências abertas

| ID | Pendência | Criticidade | Detalhe e próximo passo |
|---|---|---|---|
| PD-01 | `classes.mjs` intermitente no CI | **Média** | No GitHub (2 CPUs) o Arqueiro às vezes não derruba o esqueleto a tempo (o esqueleto volta a "idle" longe do Arqueiro). Passa sempre no PC, mesmo com CPU sobrecarregada. O `run-all.sh` repete a suíte 1 vez e marca FLAKY. Corrigir: tornar o teste independente de tempo (ex.: esperar o abate por evento) e remover a dependência da repetição. |
| PD-02 | `guerreiro.mjs` e `party.mjs` também intermitentes no CI | **Média** | `guerreiro.mjs` falhou na 1ª tentativa e passou na repetição (mesmo padrão da PD-01). `party.mjs` também ficou intermitente no CI e passou só na repetição. `loot.mjs` falhava de forma fixa no GitHub porque o Clérigo ficava longe do chefe; já corrigido. Tornar `guerreiro.mjs` e `party.mjs` independentes de tempo. |
| PD-05 | Restauração do banco ainda não testada pelo usuário | **Alta** | Os scripts de backup e o guia `docs/BACKUP_RESTAURACAO.md` estão prontos, mas nenhuma restauração foi feita num banco de teste. Próximo passo: rodar a seção 3 do guia num banco de teste e anotar a data aqui. |
| PD-03 | Cobertura de CI só do servidor | **Baixa** | O cliente (Phaser/Vite) só passa pelo typecheck; não há teste automático de interface. Avaliar após a etapa C1. |
| PD-04 | Servidores de teste esquecidos no Windows | **Baixa** | O `run-all.sh` agora encerra a árvore de processos; se uma rodada for interrompida à força, restam processos `tsx src/index.ts`. Encerre-os pelo Gerenciador de Tarefas. |

Regra: pendência **Alta** não passa de marco; **Média** deve ser resolvida até o fim da etapa seguinte; **Baixa** entra quando houver folga.
