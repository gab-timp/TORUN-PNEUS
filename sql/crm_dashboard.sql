-- CRM: leitura para o DASHBOARD (mensal e anual, do time e do executivo).
--
-- O dashboard cruza o faturamento lançado pela Beth com a meta, a comissão e as ligações. As tabelas de faturamento e de % de
-- comissão só abrem para o financeiro e a gestão (RLS); o executivo precisa ver só os números dele. Estas duas funções
-- (security definer) fazem essa leitura, sem gravar nada:
--
--   crm_dashboard_faturamento(p_ano)  -> uma linha por sistema, cliente, executivo do lançamento e mês (soma dos lançamentos),
--                                        dos anos p_ano e p_ano - 1. O executivo gravado é o da carteira NA HORA do lançamento,
--                                        o mesmo que o relatório de comissão usa.
--   crm_dashboard_clientes_historico() -> clientes que já tiveram qualquer faturamento (para "nunca comprou").
--   crm_dashboard_percentuais(p_ano)  -> % de comissão de cada executivo, por mês, até dezembro de p_ano (o % de um mês sem
--                                        linha própria é o último anterior, como na tela Faturamento).
--
-- Quem lê: gestão (todos os executivos) e executivo (só as linhas dele, no sistema dele). Financeiro e quem não tem papel no
-- CRM não recebem nada. A meta do executivo já é lida direto de crm_meta_executivo (política própria, em crm_metas.sql).
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-dashboard.js). Sem este SQL a tela Dashboard só avisa que o SQL
-- ainda não foi rodado. Pré-requisitos: crm_faturamento.sql e crm_metas.sql. Pode rodar de novo.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create or replace function crm_dashboard_faturamento(p_ano int)
returns table(sistema text, cliente text, executivo_user_id uuid, executivo_nome text, mes date, valor numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel text := current_user_crm_papel();
begin
  if v_papel is null or v_papel not in ('executivo', 'gestao') then
    return;
  end if;
  return query
    select i.sistema, i.cliente, i.executivo_user_id, i.executivo_nome,
           date_trunc('month', l.periodo_de)::date as mes, sum(i.valor)::numeric as valor
    from crm_faturamento_itens i
    join crm_faturamento_lancamentos l on l.id = i.lancamento_id
    where extract(year from l.periodo_de) in (p_ano, p_ano - 1)
      and (v_papel = 'gestao' or (i.executivo_user_id = auth.uid() and crm_pode_sistema(i.sistema)))
    group by i.sistema, i.cliente, i.executivo_user_id, i.executivo_nome, date_trunc('month', l.periodo_de)::date;
end;
$$;

create or replace function crm_dashboard_percentuais(p_ano int)
returns table(executivo_user_id uuid, mes date, percentual numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel text := current_user_crm_papel();
begin
  if v_papel is null or v_papel not in ('executivo', 'gestao') then
    return;
  end if;
  return query
    select p.executivo_user_id, p.mes, p.percentual
    from crm_comissao_percentual p
    where p.mes <= make_date(p_ano, 12, 1)
      and (v_papel = 'gestao' or p.executivo_user_id = auth.uid());
end;
$$;

-- Clientes que já tiveram QUALQUER faturamento lançado (todo o histórico), para o "nunca comprou" do Dashboard mensal.
-- Mesmo escopo das outras: gestão vê todos; executivo, só os clientes dele.
create or replace function crm_dashboard_clientes_historico()
returns table(sistema text, cliente text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel text := current_user_crm_papel();
begin
  if v_papel is null or v_papel not in ('executivo', 'gestao') then
    return;
  end if;
  return query
    select distinct i.sistema, i.cliente
    from crm_faturamento_itens i
    where i.valor > 0
      and (v_papel = 'gestao' or (i.executivo_user_id = auth.uid() and crm_pode_sistema(i.sistema)));
end;
$$;

revoke all on function crm_dashboard_clientes_historico() from public;
grant execute on function crm_dashboard_clientes_historico() to authenticated;

revoke all on function crm_dashboard_faturamento(int) from public;
grant execute on function crm_dashboard_faturamento(int) to authenticated;
revoke all on function crm_dashboard_percentuais(int) from public;
grant execute on function crm_dashboard_percentuais(int) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from pg_proc where proname = 'crm_dashboard_faturamento') as faturamento,
  (select count(*) = 1 from pg_proc where proname = 'crm_dashboard_percentuais') as percentuais,
  (select count(*) = 1 from pg_proc where proname = 'crm_dashboard_clientes_historico') as historico;
