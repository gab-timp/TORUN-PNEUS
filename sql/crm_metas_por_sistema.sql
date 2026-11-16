-- CRM: METAS, EQUIPE E % DE COMISSÃO POR SISTEMA (Atacado e Encomenda).
--
-- Antes: uma meta por executivo (e uma meta de equipe) valendo para o CRM inteiro, e um % de comissão por executivo/mês.
-- Agora: tudo isso é separado por sistema. A gestão entra no Atacado para cadastrar as metas do Atacado e entra na Encomenda
-- para cadastrar as da Encomenda; não existe visão unificada. A soma das metas individuais tem que bater com a meta da equipe
-- DO MESMO sistema.
--
-- O QUE ESTE SCRIPT FAZ
--   1) Coluna "sistema" em crm_meta_equipe, crm_meta_executivo, crm_meta_mes_equipe, crm_meta_mes_executivo e
--      crm_comissao_percentual; a chave primária de cada uma passa a incluir o sistema.
--   2) As metas já cadastradas viram metas da ENCOMENDA (o Atacado começa vazio).
--   3) Os % de comissão já cadastrados são COPIADOS para os dois sistemas (assim o Relatório de comissão e o Faturamento do
--      Atacado continuam com o % de antes até a gestão definir o do Atacado).
--   4) Funções de salvar metas (anual e do mês) e comissões do mês ganham o parâmetro p_sistema (as versões antigas saem).
--      crm_salvar_lancamento e crm_atualizar_lancamento continuam com a mesma assinatura, mas gravam o % no sistema do lançamento.
--      crm_dashboard_percentuais passa a devolver também o sistema.
--
-- ORDEM: rode ANTES de publicar a versão nova do site. Pré-requisitos: crm_metas.sql, crm_metas_mensais.sql,
-- crm_metas_comissoes.sql, crm_faturamento.sql, crm_faturamento_correcao.sql, crm_dashboard.sql. Pode rodar de novo
-- (a parte das colunas só roda uma vez). Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só a última consulta).

-- ---------------------------------------------------------------- colunas e chaves
do $$
declare r record;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_meta_equipe' and column_name = 'sistema') then
    return;
  end if;

  -- as chaves estrangeiras e primárias antigas saem (os nomes variam, então busca pelo catálogo)
  for r in select conrelid::regclass::text as t, conname from pg_constraint
           where contype = 'f' and conrelid in ('crm_meta_executivo'::regclass, 'crm_meta_mes_executivo'::regclass) loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;
  for r in select conrelid::regclass::text as t, conname from pg_constraint
           where contype = 'p' and conrelid in ('crm_meta_equipe'::regclass, 'crm_meta_executivo'::regclass, 'crm_meta_mes_equipe'::regclass,
                                                'crm_meta_mes_executivo'::regclass, 'crm_comissao_percentual'::regclass) loop
    execute format('alter table %s drop constraint %I', r.t, r.conname);
  end loop;

  alter table crm_meta_equipe add column sistema text;
  alter table crm_meta_executivo add column sistema text;
  alter table crm_meta_mes_equipe add column sistema text;
  alter table crm_meta_mes_executivo add column sistema text;
  alter table crm_comissao_percentual add column sistema text;

  -- metas existentes viram Encomenda
  update crm_meta_equipe set sistema = 'encomenda';
  update crm_meta_executivo set sistema = 'encomenda';
  update crm_meta_mes_equipe set sistema = 'encomenda';
  update crm_meta_mes_executivo set sistema = 'encomenda';
  -- % de comissão existente: vale para os dois sistemas
  update crm_comissao_percentual set sistema = 'encomenda';
  insert into crm_comissao_percentual (executivo_user_id, mes, percentual, atualizado_por, atualizado_em, sistema)
  select executivo_user_id, mes, percentual, atualizado_por, atualizado_em, 'atacado' from crm_comissao_percentual where sistema = 'encomenda';

  alter table crm_meta_equipe alter column sistema set not null;
  alter table crm_meta_executivo alter column sistema set not null;
  alter table crm_meta_mes_equipe alter column sistema set not null;
  alter table crm_meta_mes_executivo alter column sistema set not null;
  alter table crm_comissao_percentual alter column sistema set not null;

  alter table crm_meta_equipe add constraint crm_meta_equipe_sistema_chk check (sistema in ('atacado', 'encomenda'));
  alter table crm_meta_executivo add constraint crm_meta_executivo_sistema_chk check (sistema in ('atacado', 'encomenda'));
  alter table crm_meta_mes_equipe add constraint crm_meta_mes_equipe_sistema_chk check (sistema in ('atacado', 'encomenda'));
  alter table crm_meta_mes_executivo add constraint crm_meta_mes_executivo_sistema_chk check (sistema in ('atacado', 'encomenda'));
  alter table crm_comissao_percentual add constraint crm_comissao_percentual_sistema_chk check (sistema in ('atacado', 'encomenda'));

  alter table crm_meta_equipe add primary key (ano, sistema);
  alter table crm_meta_executivo add primary key (ano, sistema, executivo_user_id);
  alter table crm_meta_executivo add constraint crm_meta_executivo_equipe_fk foreign key (ano, sistema) references crm_meta_equipe (ano, sistema) on delete cascade;
  alter table crm_meta_mes_equipe add primary key (mes, sistema);
  alter table crm_meta_mes_executivo add primary key (mes, sistema, executivo_user_id);
  alter table crm_meta_mes_executivo add constraint crm_meta_mes_executivo_equipe_fk foreign key (mes, sistema) references crm_meta_mes_equipe (mes, sistema) on delete cascade;
  alter table crm_comissao_percentual add primary key (executivo_user_id, mes, sistema);
end;
$$;

-- ---------------------------------------------------------------- salvar meta anual (por sistema)
drop function if exists crm_salvar_metas(int, numeric, jsonb);
create or replace function crm_salvar_metas(p_ano int, p_sistema text, p_equipe numeric, p_individuais jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soma numeric;
begin
  if current_user_crm_papel() is distinct from 'gestao' or not crm_pode_escrever() then
    raise exception 'Só a gestão cadastra metas.' using errcode = '42501';
  end if;
  if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
  end if;
  if p_ano is null or p_ano not between 2000 and 2100 then
    raise exception 'Ano inválido.';
  end if;
  if p_equipe is null or p_equipe < 0 then
    raise exception 'Informe a meta da equipe.';
  end if;
  if p_individuais is null or jsonb_typeof(p_individuais) <> 'array' then
    raise exception 'Metas individuais inválidas.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_individuais) x
    where (x->>'valor') is null or (x->>'valor')::numeric < 0
       or not crm_recebe_meta((x->>'executivo_user_id')::uuid)
  ) then
    raise exception 'Cada meta individual precisa de um executivo e de um valor maior ou igual a zero.';
  end if;
  select coalesce(sum((x->>'valor')::numeric), 0) into v_soma from jsonb_array_elements(p_individuais) x;
  if v_soma <> p_equipe then
    raise exception 'A soma das metas individuais (R$ %) não bate com a meta da equipe (R$ %).', v_soma, p_equipe;
  end if;

  insert into crm_meta_equipe (ano, sistema, valor, atualizado_em, atualizado_por)
  values (p_ano, p_sistema, p_equipe, now(), auth.uid())
  on conflict (ano, sistema) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();

  delete from crm_meta_executivo where ano = p_ano and sistema = p_sistema;
  insert into crm_meta_executivo (ano, sistema, executivo_user_id, valor)
  select p_ano, p_sistema, (x->>'executivo_user_id')::uuid, (x->>'valor')::numeric from jsonb_array_elements(p_individuais) x;
end;
$$;
revoke all on function crm_salvar_metas(int, text, numeric, jsonb) from public;
grant execute on function crm_salvar_metas(int, text, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------- salvar meta do mês (por sistema)
drop function if exists crm_salvar_metas_mes(date, numeric, jsonb);
create or replace function crm_salvar_metas_mes(p_mes date, p_sistema text, p_equipe numeric, p_individuais jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soma numeric;
  v_mes date;
begin
  if current_user_crm_papel() is distinct from 'gestao' or not crm_pode_escrever() then
    raise exception 'Só a gestão cadastra metas.' using errcode = '42501';
  end if;
  if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
  end if;
  if p_mes is null then
    raise exception 'Informe o mês.';
  end if;
  v_mes := date_trunc('month', p_mes)::date;
  if extract(year from v_mes) not between 2000 and 2100 then
    raise exception 'Mês inválido.';
  end if;
  if p_equipe is null or p_equipe < 0 then
    raise exception 'Informe a meta da equipe.';
  end if;
  if p_individuais is null or jsonb_typeof(p_individuais) <> 'array' then
    raise exception 'Metas individuais inválidas.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_individuais) x
    where (x->>'valor') is null or (x->>'valor')::numeric < 0
       or not crm_recebe_meta((x->>'executivo_user_id')::uuid)
  ) then
    raise exception 'Cada meta individual precisa de um executivo e de um valor maior ou igual a zero.';
  end if;
  select coalesce(sum((x->>'valor')::numeric), 0) into v_soma from jsonb_array_elements(p_individuais) x;
  if v_soma <> p_equipe then
    raise exception 'A soma das metas individuais (R$ %) não bate com a meta da equipe (R$ %).', v_soma, p_equipe;
  end if;

  insert into crm_meta_mes_equipe (mes, sistema, valor, atualizado_em, atualizado_por)
  values (v_mes, p_sistema, p_equipe, now(), auth.uid())
  on conflict (mes, sistema) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();

  delete from crm_meta_mes_executivo where mes = v_mes and sistema = p_sistema;
  insert into crm_meta_mes_executivo (mes, sistema, executivo_user_id, valor)
  select v_mes, p_sistema, (x->>'executivo_user_id')::uuid, (x->>'valor')::numeric from jsonb_array_elements(p_individuais) x;
end;
$$;
revoke all on function crm_salvar_metas_mes(date, text, numeric, jsonb) from public;
grant execute on function crm_salvar_metas_mes(date, text, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------- % de comissão do mês (por sistema)
drop function if exists crm_salvar_comissoes_mes(date, jsonb);
create or replace function crm_salvar_comissoes_mes(p_mes date, p_sistema text, p_percentuais jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date;
  x jsonb;
begin
  if current_user_crm_papel() is distinct from 'gestao' or not crm_pode_escrever() then
    raise exception 'Só a gestão define o percentual de comissão aqui.' using errcode = '42501';
  end if;
  if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
  end if;
  if p_mes is null then
    raise exception 'Informe o mês.';
  end if;
  v_mes := date_trunc('month', p_mes)::date;
  if p_percentuais is null or jsonb_typeof(p_percentuais) <> 'array' then
    raise exception 'Percentuais inválidos.';
  end if;
  for x in select * from jsonb_array_elements(p_percentuais) loop
    if (x->>'executivo_user_id') is null or (x->>'percentual') is null then continue; end if;
    if (x->>'percentual')::numeric < 0 or (x->>'percentual')::numeric > 100 then
      raise exception 'O percentual de comissão tem que ficar entre 0 e 100.';
    end if;
    if not crm_recebe_meta((x->>'executivo_user_id')::uuid) then
      raise exception 'Percentual para alguém que não é executivo nem gestão com carteira.';
    end if;
    insert into crm_comissao_percentual (executivo_user_id, mes, sistema, percentual, atualizado_por, atualizado_em)
    values ((x->>'executivo_user_id')::uuid, v_mes, p_sistema, round((x->>'percentual')::numeric, 2), auth.uid(), now())
    on conflict (executivo_user_id, mes, sistema) do update
      set percentual = excluded.percentual, atualizado_por = auth.uid(), atualizado_em = now();
  end loop;
end;
$$;
revoke all on function crm_salvar_comissoes_mes(date, text, jsonb) from public;
grant execute on function crm_salvar_comissoes_mes(date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- Faturamento da Beth: o % vale para o sistema do lançamento
-- (mesma assinatura de antes; só muda onde o % é gravado)
create or replace function crm_salvar_lancamento(p_sistema text, p_de date, p_ate date, p_itens jsonb, p_percentuais jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
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
    raise exception 'Só o financeiro lança o faturamento.' using errcode = '42501';
  end if;
  if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
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

  insert into crm_faturamento_lancamentos (sistema, periodo_de, periodo_ate, total, created_by_nome)
  values (p_sistema, p_de, p_ate, 0, v_nome)
  returning id into v_id;

  for x in select value from jsonb_array_elements(p_itens) loop
    v_cli := x->>'cliente';
    v_valor := (x->>'valor')::numeric;
    if v_cli is null or v_valor is null or v_valor <= 0 then
      raise exception 'Cada cliente precisa de um valor maior que zero.';
    end if;
    select c.executivo_user_id, c.executivo_nome into v_exec, v_exec_nome
    from crm_carteira c
    join crm_clientes k on k.nome = c.cliente
    where c.sistema = p_sistema and c.cliente = v_cli and k.tipo = 'cliente';
    if v_exec is null then
      raise exception 'O cliente "%" não é um cliente efetivo da carteira de %.', v_cli, p_sistema;
    end if;
    if exists (select 1 from crm_faturamento_itens i where i.lancamento_id = v_id and i.cliente = v_cli) then
      raise exception 'O cliente "%" aparece duas vezes no lançamento.', v_cli;
    end if;
    insert into crm_faturamento_itens (lancamento_id, sistema, cliente, executivo_user_id, executivo_nome, valor)
    values (v_id, p_sistema, v_cli, v_exec, v_exec_nome, round(v_valor, 2));
    v_total := v_total + round(v_valor, 2);
  end loop;

  update crm_faturamento_lancamentos set total = v_total where id = v_id;

  if p_percentuais is not null and jsonb_typeof(p_percentuais) = 'array' then
    for x in select value from jsonb_array_elements(p_percentuais) loop
      if (x->>'executivo_user_id') is null or (x->>'percentual') is null then continue; end if;
      if (x->>'percentual')::numeric < 0 or (x->>'percentual')::numeric > 100 then
        raise exception 'O percentual de comissão tem que ficar entre 0 e 100.';
      end if;
      insert into crm_comissao_percentual (executivo_user_id, mes, sistema, percentual, atualizado_por, atualizado_em)
      values ((x->>'executivo_user_id')::uuid, v_mes, p_sistema, round((x->>'percentual')::numeric, 2), auth.uid(), now())
      on conflict (executivo_user_id, mes, sistema) do update
        set percentual = excluded.percentual, atualizado_por = auth.uid(), atualizado_em = now();
    end loop;
  end if;

  return v_id;
end;
$$;

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
      insert into crm_comissao_percentual (executivo_user_id, mes, sistema, percentual, atualizado_por, atualizado_em)
      values ((x->>'executivo_user_id')::uuid, v_mes, v_sistema, round((x->>'percentual')::numeric, 2), auth.uid(), now())
      on conflict (executivo_user_id, mes, sistema) do update
        set percentual = excluded.percentual, atualizado_por = auth.uid(), atualizado_em = now();
    end loop;
  end if;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------- Dashboard: % por sistema
drop function if exists crm_dashboard_percentuais(int);
create or replace function crm_dashboard_percentuais(p_ano int)
returns table(executivo_user_id uuid, sistema text, mes date, percentual numeric)
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
    select p.executivo_user_id, p.sistema, p.mes, p.percentual
    from crm_comissao_percentual p
    where p.mes <= make_date(p_ano, 12, 1)
      and (v_papel = 'gestao' or p.executivo_user_id = auth.uid());
end;
$$;
revoke all on function crm_dashboard_percentuais(int) from public;
grant execute on function crm_dashboard_percentuais(int) to authenticated;

-- ---------------------------------------------------------------- confere (ok = true em todas as linhas)
select item, ok from (values
  ('coluna sistema nas 5 tabelas', (select count(*) = 5 from information_schema.columns where table_schema = 'public' and column_name = 'sistema'
     and table_name in ('crm_meta_equipe', 'crm_meta_executivo', 'crm_meta_mes_equipe', 'crm_meta_mes_executivo', 'crm_comissao_percentual'))),
  ('funções de salvar com sistema', (select count(*) = 3 from pg_proc where proname in ('crm_salvar_metas', 'crm_salvar_metas_mes', 'crm_salvar_comissoes_mes'))),
  ('sem versão antiga das funções', (select count(*) = 0 from pg_proc where proname = 'crm_salvar_metas' and pronargs = 3)),
  ('dashboard devolve sistema', (select count(*) = 1 from pg_proc where proname = 'crm_dashboard_percentuais'))
) as t(item, ok);
