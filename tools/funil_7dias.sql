-- Funil dos últimos 7 dias (card C0.5, telemetria mínima).
-- Conta quantas CONTAS distintas chegaram a cada etapa nos últimos 7 dias. Cada etapa é contada sozinha:
-- uma conta que abateu alguém nesta semana conta em "Primeiro abate" mesmo que tenha logado antes da janela.
-- Como rodar: no Supabase, SQL Editor > colar e executar (o SQL Editor usa o dono do banco e ignora o RLS).
-- Só funciona no banco de produção (Postgres). O banco embutido de dev (PGlite) não tem acesso de SQL externo.
with janela as (
  select now() - interval '7 days' as desde
),
passos as (
  select 1 as ordem, 'Logaram' as etapa, count(distinct e.conta_id) as contas
    from eventos e, janela j where e.tipo = 'login' and e.criado_em >= j.desde
  union all
  select 2, 'Criaram personagem', count(distinct e.conta_id)
    from eventos e, janela j where e.tipo = 'criacao_personagem' and e.criado_em >= j.desde
  union all
  select 3, 'Primeiro abate', count(distinct e.conta_id)
    from eventos e, janela j where e.tipo = 'primeiro_abate' and e.criado_em >= j.desde
  union all
  select 4, 'Chegaram ao nível 5', count(distinct e.conta_id)
    from eventos e, janela j where e.tipo = 'nivel_5' and e.criado_em >= j.desde
)
select
  etapa,
  contas,
  round(100.0 * contas / nullif((select contas from passos where ordem = 1), 0), 1) as pct_dos_que_logaram
from passos
order by ordem;
