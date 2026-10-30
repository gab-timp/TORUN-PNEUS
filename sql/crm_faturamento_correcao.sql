-- CRM: CORRIGIR e EXCLUIR um lançamento de faturamento já salvo (Financeiro > Faturamento).
--
-- Só o financeiro (a Beth). Corrigir SUBSTITUI o lançamento: o período, os valores e o total antigos somem e entram os novos
-- (não guarda cópia do que foi alterado). O executivo gravado em cada item é o da carteira NA HORA de salvar a correção.
-- Excluir apaga o lançamento e os itens dele (cascade); o faturamento e a comissão do mês deixam de contar esse valor.
-- Os % de comissão enviados na correção valem para o mês do lançamento, igual ao salvar.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-faturamento.js v3). Pré-requisito: crm_faturamento.sql já rodado.
-- Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create or replace function crm_atualizar_lancamento(p_id uuid, p_de date, p_ate date, p_itens jsonb, p_percentuais jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema text;
  v_total numeric := 0;
  v_nome text;
  x jsonb;
  v_cli text;
  v_valor numeric;
  v_exec uuid;
  v_exec_nome text;
  v_mes date;
begin
  if current_user_crm_papel() is distinct from 'financeiro' or not crm_pode_escrever() then
    raise exception 'Só o financeiro corrige o faturamento.' using errcode = '42501';
  end if;
  select sistema into v_sistema from crm_faturamento_lancamentos where id = p_id;
  if v_sistema is null then
    raise exception 'Lançamento não encontrado (talvez já tenha sido excluído).';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido: o "Até" não pode vir antes do "De".';
  end if;
  if extract(year from p_de) <> extract(year from p_ate) or extract(month from p_de) <> extract(month from p_ate) then
    raise exception 'O período tem que ficar dentro de um mês.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe o faturamento de pelo menos um cliente.';
  end if;

  select coalesce(nullif(u.nome, ''), u.email) into v_nome from user_roles u where u.user_id = auth.uid();
  v_mes := date_trunc('month', p_de)::date;

  delete from crm_faturamento_itens where lancamento_id = p_id;

  for x in select value from jsonb_array_elements(p_itens) loop
    v_cli := x->>'cliente';
    v_valor := (x->>'valor')::numeric;
    if v_cli is null or v_valor is null or v_valor <= 0 then
      raise exception 'Cada cliente precisa de um valor maior que zero.';
    end if;
    v_exec := null;
    select c.executivo_user_id, c.executivo_nome into v_exec, v_exec_nome
    from crm_carteira c
    join crm_clientes k on k.nome = c.cliente
    where c.sistema = v_sistema and c.cliente = v_cli and k.tipo = 'cliente';
    if v_exec is null then
      raise exception 'O cliente "%" não é um cliente efetivo da carteira de %.', v_cli, v_sistema;
    end if;
    if exists (select 1 from crm_faturamento_itens i where i.lancamento_id = p_id and i.cliente = v_cli) then
      raise exception 'O cliente "%" aparece duas vezes no lançamento.', v_cli;
    end if;
    insert into crm_faturamento_itens (lancamento_id, sistema, cliente, executivo_user_id, executivo_nome, valor)
    values (p_id, v_sistema, v_cli, v_exec, v_exec_nome, round(v_valor, 2));
    v_total := v_total + round(v_valor, 2);
  end loop;

  update crm_faturamento_lancamentos
     set periodo_de = p_de, periodo_ate = p_ate, total = v_total,
         created_by = auth.uid(), created_by_nome = v_nome, created_at = now()
   where id = p_id;

  if p_percentuais is not null and jsonb_typeof(p_percentuais) = 'array' then
    for x in select value from jsonb_array_elements(p_percentuais) loop
      if (x->>'executivo_user_id') is null or (x->>'percentual') is null then continue; end if;
      if (x->>'percentual')::numeric < 0 or (x->>'percentual')::numeric > 100 then
        raise exception 'O percentual de comissão tem que ficar entre 0 e 100.';
      end if;
      insert into crm_comissao_percentual (executivo_user_id, mes, percentual, atualizado_por, atualizado_em)
      values ((x->>'executivo_user_id')::uuid, v_mes, round((x->>'percentual')::numeric, 2), auth.uid(), now())
      on conflict (executivo_user_id, mes) do update
        set percentual = excluded.percentual, atualizado_por = auth.uid(), atualizado_em = now();
    end loop;
  end if;

  return p_id;
end;
$$;

create or replace function crm_excluir_lancamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user_crm_papel() is distinct from 'financeiro' or not crm_pode_escrever() then
    raise exception 'Só o financeiro exclui lançamentos de faturamento.' using errcode = '42501';
  end if;
  delete from crm_faturamento_lancamentos where id = p_id;
  if not found then
    raise exception 'Lançamento não encontrado (talvez já tenha sido excluído).';
  end if;
end;
$$;

revoke all on function crm_atualizar_lancamento(uuid, date, date, jsonb, jsonb) from public;
grant execute on function crm_atualizar_lancamento(uuid, date, date, jsonb, jsonb) to authenticated;
revoke all on function crm_excluir_lancamento(uuid) from public;
grant execute on function crm_excluir_lancamento(uuid) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from pg_proc where proname = 'crm_atualizar_lancamento') as corrigir,
  (select count(*) = 1 from pg_proc where proname = 'crm_excluir_lancamento') as excluir;
