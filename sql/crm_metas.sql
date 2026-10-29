-- CRM Atacado e Encomenda: metas anuais (Gestão > Metas).
--
-- A gestão cadastra UMA meta anual da equipe e, junto, a meta individual de cada executivo; a soma das
-- individuais tem que ser igual à meta da equipe. Só a gestão (administrador conta como gestão) grava, e só
-- pela função crm_salvar_metas, que confere a soma de dentro do banco (as tabelas não aceitam escrita direta).
-- O executivo lê só a própria meta (para o Dashboard dele, que ainda não existe).
--
-- Tudo aditivo: 2 tabelas novas e 2 funções novas; nada existente é alterado. Pode rodar antes ou depois do
-- deploy: sem ele, a tela Metas só avisa que o SQL ainda não foi rodado.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- tabelas
create table if not exists crm_meta_equipe (
  ano int primary key check (ano between 2000 and 2100),
  valor numeric(14,2) not null check (valor >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

create table if not exists crm_meta_executivo (
  ano int not null references crm_meta_equipe(ano) on delete cascade,
  executivo_user_id uuid not null,
  valor numeric(14,2) not null check (valor >= 0),
  primary key (ano, executivo_user_id)
);

alter table crm_meta_equipe enable row level security;
alter table crm_meta_executivo enable row level security;

drop policy if exists crm_meta_equipe_select on crm_meta_equipe;
create policy crm_meta_equipe_select on crm_meta_equipe for select to authenticated
  using (current_user_crm_papel() = 'gestao');

drop policy if exists crm_meta_executivo_select on crm_meta_executivo;
create policy crm_meta_executivo_select on crm_meta_executivo for select to authenticated
  using (current_user_crm_papel() = 'gestao' or executivo_user_id = auth.uid());

-- sem política de insert/update/delete: a escrita só passa pela função abaixo

-- ---------------------------------------------------------------- executivos que recebem meta
create or replace function crm_executivos_metas()
returns table (user_id uuid, nome text, sistemas text[])
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
           coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end)
    from user_roles u
    where u.crm_papel = 'executivo'
    order by 2;
end;
$$;

-- ---------------------------------------------------------------- salvar (meta da equipe + individuais)
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
       or not exists (select 1 from user_roles u where u.user_id = (x->>'executivo_user_id')::uuid and u.crm_papel = 'executivo')
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

revoke all on function crm_executivos_metas() from public;
revoke all on function crm_salvar_metas(int, numeric, jsonb) from public;
grant execute on function crm_executivos_metas() to authenticated;
grant execute on function crm_salvar_metas(int, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 2 from information_schema.tables where table_name in ('crm_meta_equipe', 'crm_meta_executivo')) as tabelas,
  (select count(*) = 2 from pg_proc where proname in ('crm_executivos_metas', 'crm_salvar_metas')) as funcoes,
  (select count(*) = 2 from pg_policies where tablename in ('crm_meta_equipe', 'crm_meta_executivo')) as politicas,
  (select count(*) = 0 from pg_policies where tablename in ('crm_meta_equipe', 'crm_meta_executivo') and cmd <> 'SELECT') as sem_escrita_direta;
