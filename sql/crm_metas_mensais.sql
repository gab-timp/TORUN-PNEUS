-- CRM: METAS MÊS A MÊS (Gestão > Metas > aba "Mês a mês").
--
-- Além da meta anual (crm_metas.sql, que continua como está e separada), a gestão digita a meta de cada MÊS: um valor para a
-- equipe e um para cada executivo. A soma dos executivos tem que ser igual à da equipe (a função confere no banco). O Dashboard
-- mensal compara o faturamento do mês com essa meta; o anual usa a meta anual e, para o "ritmo esperado", soma as metas
-- mensais cadastradas até hoje (mês sem meta digitada conta zero).
--
--   crm_meta_mes_equipe     -> meta da equipe no mês (mes = primeiro dia do mês)
--   crm_meta_mes_executivo  -> meta de cada executivo no mês
--
-- Quem lê: a gestão vê tudo; o executivo lê só a linha dele de crm_meta_mes_executivo. Quem grava: só a gestão, só pela
-- função crm_salvar_metas_mes (as tabelas não aceitam escrita direta).
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm-metas-mes.js). Pré-requisito: crm_metas.sql. Pode rodar de novo.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create table if not exists crm_meta_mes_equipe (
  mes date primary key check (extract(day from mes) = 1),
  valor numeric(14,2) not null check (valor >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

create table if not exists crm_meta_mes_executivo (
  mes date not null references crm_meta_mes_equipe(mes) on delete cascade,
  executivo_user_id uuid not null,
  valor numeric(14,2) not null check (valor >= 0),
  primary key (mes, executivo_user_id)
);

alter table crm_meta_mes_equipe enable row level security;
alter table crm_meta_mes_executivo enable row level security;

drop policy if exists crm_meta_mes_equipe_select on crm_meta_mes_equipe;
create policy crm_meta_mes_equipe_select on crm_meta_mes_equipe for select to authenticated
  using (current_user_crm_papel() = 'gestao');

drop policy if exists crm_meta_mes_executivo_select on crm_meta_mes_executivo;
create policy crm_meta_mes_executivo_select on crm_meta_mes_executivo for select to authenticated
  using (current_user_crm_papel() = 'gestao' or executivo_user_id = auth.uid());
-- sem política de insert/update/delete: a escrita só passa pela função abaixo

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
       or not exists (select 1 from user_roles u where u.user_id = (x->>'executivo_user_id')::uuid and u.crm_papel = 'executivo')
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

revoke all on function crm_salvar_metas_mes(date, numeric, jsonb) from public;
grant execute on function crm_salvar_metas_mes(date, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 2 from information_schema.tables where table_name in ('crm_meta_mes_equipe', 'crm_meta_mes_executivo')) as tabelas,
  (select count(*) = 1 from pg_proc where proname = 'crm_salvar_metas_mes') as funcao,
  (select count(*) = 2 from pg_policies where tablename in ('crm_meta_mes_equipe', 'crm_meta_mes_executivo')) as politicas,
  (select count(*) = 0 from pg_policies where tablename in ('crm_meta_mes_equipe', 'crm_meta_mes_executivo') and cmd <> 'SELECT') as sem_escrita_direta;
