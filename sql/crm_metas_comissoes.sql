-- CRM: METAS E COMISSÕES (Gestão > Metas e comissões).
--
--   1) A lista de quem recebe meta passa a incluir a GESTÃO COM CARTEIRA PRÓPRIA (ex.: a Angela), além dos executivos.
--      É a mesma regra de crm_executivos (usada para escolher o responsável de um cliente). crm_executivos_metas() ganha a
--      coluna "papel" (o site usa para saber que este SQL foi rodado).
--   2) crm_salvar_metas e crm_salvar_metas_mes passam a aceitar essas pessoas (antes só papel = 'executivo').
--   3) crm_salvar_comissoes_mes(mês, percentuais): a gestão define a % de comissão de cada executivo no mês. Grava na mesma
--      tabela que a Beth usa no lançamento de faturamento (crm_comissao_percentual), então o Relatório de comissão e o
--      Faturamento passam a mostrar o mesmo número. Se a Beth e a gestão mexerem no mesmo mês, vale quem salvou por último.
--
-- O valor da comissão que a tela mostra (meta do mês × %) é só uma conta da tela, não é gravado.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-metas-mes.js v2). Pré-requisitos: crm_metas.sql,
-- crm_metas_mensais.sql, crm_faturamento.sql e crm_gestao_carteira_propria.sql. Pode rodar de novo. Rode o script INTEIRO
-- no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- quem pode receber meta
create or replace function crm_recebe_meta(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles u
    where u.user_id = p_user
      and (
        u.crm_papel = 'executivo'
        or (u.crm_tem_carteira and coalesce(u.crm_papel, case when u.is_admin then 'gestao' end) = 'gestao')
      )
  );
$$;
revoke all on function crm_recebe_meta(uuid) from public;
grant execute on function crm_recebe_meta(uuid) to authenticated;

-- ---------------------------------------------------------------- lista da tela de metas
drop function if exists crm_executivos_metas();
create or replace function crm_executivos_metas()
returns table (user_id uuid, nome text, sistemas text[], papel text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_user_crm_papel() is distinct from 'gestao' then
    raise exception 'Só a gestão vê as metas.' using errcode = '42501';
  end if;
  return query
    select u.user_id,
           coalesce(nullif(u.nome, ''), u.email),
           case
             when u.crm_papel = 'executivo'
               then coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end)
             else array['atacado', 'encomenda']
           end,
           case when u.crm_papel = 'executivo' then 'executivo' else 'gestao' end
    from user_roles u
    where crm_recebe_meta(u.user_id)
    order by 2;
end;
$$;
revoke all on function crm_executivos_metas() from public;
grant execute on function crm_executivos_metas() to authenticated;

-- ---------------------------------------------------------------- salvar meta anual (mesma função, aceitando a gestão com carteira)
create or replace function crm_salvar_metas(p_ano int, p_equipe numeric, p_individuais jsonb)
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

  insert into crm_meta_equipe (ano, valor, atualizado_em, atualizado_por)
  values (p_ano, p_equipe, now(), auth.uid())
  on conflict (ano) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();

  delete from crm_meta_executivo where ano = p_ano;
  insert into crm_meta_executivo (ano, executivo_user_id, valor)
  select p_ano, (x->>'executivo_user_id')::uuid, (x->>'valor')::numeric from jsonb_array_elements(p_individuais) x;
end;
$$;

-- ---------------------------------------------------------------- salvar meta do mês (idem)
create or replace function crm_salvar_metas_mes(p_mes date, p_equipe numeric, p_individuais jsonb)
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

  insert into crm_meta_mes_equipe (mes, valor, atualizado_em, atualizado_por)
  values (v_mes, p_equipe, now(), auth.uid())
  on conflict (mes) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();

  delete from crm_meta_mes_executivo where mes = v_mes;
  insert into crm_meta_mes_executivo (mes, executivo_user_id, valor)
  select v_mes, (x->>'executivo_user_id')::uuid, (x->>'valor')::numeric from jsonb_array_elements(p_individuais) x;
end;
$$;

-- ---------------------------------------------------------------- % de comissão do mês (gestão)
-- p_percentuais: [{ "executivo_user_id": "uuid", "percentual": 1.5 }, ...]
create or replace function crm_salvar_comissoes_mes(p_mes date, p_percentuais jsonb)
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
    insert into crm_comissao_percentual (executivo_user_id, mes, percentual, atualizado_por, atualizado_em)
    values ((x->>'executivo_user_id')::uuid, v_mes, round((x->>'percentual')::numeric, 2), auth.uid(), now())
    on conflict (executivo_user_id, mes) do update
      set percentual = excluded.percentual, atualizado_por = auth.uid(), atualizado_em = now();
  end loop;
end;
$$;
revoke all on function crm_salvar_comissoes_mes(date, jsonb) from public;
grant execute on function crm_salvar_comissoes_mes(date, jsonb) to authenticated;

-- ---------------------------------------------------------------- confere (rode sozinho; ok = true em todas as linhas)
select item, ok from (values
  ('função que diz quem recebe meta', (select count(*) = 1 from pg_proc where proname = 'crm_recebe_meta')),
  ('lista de metas com a coluna papel', (select count(*) = 1 from information_schema.routines r where r.routine_name = 'crm_executivos_metas')),
  ('função das comissões do mês', (select count(*) = 1 from pg_proc where proname = 'crm_salvar_comissoes_mes')),
  ('funções de salvar metas continuam', (select count(*) = 2 from pg_proc where proname in ('crm_salvar_metas', 'crm_salvar_metas_mes')))
) as t(item, ok);

-- Para ver quem aparece na lista (precisa ser rodado logado como gestão no app, não aqui). Para conferir no banco quem é elegível:
-- select user_id, nome, crm_papel, crm_tem_carteira from user_roles where crm_recebe_meta(user_id);
