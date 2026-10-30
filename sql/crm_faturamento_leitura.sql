-- CRM: LER o faturamento por cliente e por mês (Clientes: coluna e filtros; kanban; ficha do cliente com gráfico mensal).
--
-- As tabelas de faturamento (crm_faturamento_lancamentos / _itens) só são lidas pelo financeiro e pela gestão (RLS). O executivo
-- precisa ver o faturamento dos SEUS clientes, e nada além disso, então a leitura passa por esta função (security definer):
--   financeiro e gestão -> todos os clientes de todos os lançamentos
--   executivo           -> só os clientes que estão na carteira dele hoje (no sistema dele)
-- Devolve uma linha por sistema, cliente e mês (soma dos lançamentos do mês), dos últimos p_meses meses incluindo o atual.
-- Não grava nada. Quem lança o faturamento continua sendo só a Beth (crm_faturamento.sql).
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm.js v27). Sem este SQL a coluna de faturamento simplesmente não
-- aparece. Pré-requisito: crm_faturamento.sql já rodado. Pode rodar de novo.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create or replace function crm_faturamento_por_cliente(p_meses int default 7)
returns table(sistema text, cliente text, mes date, valor numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel text := current_user_crm_papel();
  v_ini date := (date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_meses, 7), 1) - 1))::date;
begin
  if v_papel is null or v_papel not in ('executivo', 'gestao', 'financeiro') then
    return;
  end if;
  return query
    select i.sistema, i.cliente, date_trunc('month', l.periodo_de)::date as mes, sum(i.valor)::numeric as valor
    from crm_faturamento_itens i
    join crm_faturamento_lancamentos l on l.id = i.lancamento_id
    where l.periodo_de >= v_ini
      and (
        v_papel in ('gestao', 'financeiro')
        or exists (
          select 1 from crm_carteira c
          where c.sistema = i.sistema and c.cliente = i.cliente
            and c.executivo_user_id = auth.uid() and crm_pode_sistema(c.sistema)
        )
      )
    group by i.sistema, i.cliente, date_trunc('month', l.periodo_de)::date;
end;
$$;

revoke all on function crm_faturamento_por_cliente(int) from public;
grant execute on function crm_faturamento_por_cliente(int) to authenticated;

-- ---------------------------------------------------------------- confere
select (select count(*) = 1 from pg_proc where proname = 'crm_faturamento_por_cliente') as funcao_leitura;
