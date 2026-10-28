-- CRM: o executivo pode ter a carteira do Atacado, da Encomenda ou das duas.
--
-- Hoje user_roles.crm_sistema guarda UM sistema por executivo. Esta mudança acrescenta user_roles.crm_sistemas (lista)
-- e passa as regras de acesso a olhar a lista. Quem não tem a lista continua valendo pelo crm_sistema de antes, então
-- nenhum executivo atual perde acesso e este SQL pode rodar antes ou depois do deploy do site.
--
-- O site continua gravando crm_sistema com o PRIMEIRO sistema da lista, para a regra user_roles_crm_executivo_sistema_check
-- (executivo precisa de sistema) seguir valendo sem mexer nela.
--
-- Muda só: 1 coluna nova, 1 função nova, 2 funções redefinidas (crm_pode_sistema e crm_executivos) e as 3 políticas da
-- carteira (leitura, inserção e alteração) que comparavam com o sistema único. Contatos, ligações, histórico e perfil
-- perguntam à carteira, então acompanham sozinhos.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- coluna nova
alter table user_roles add column if not exists crm_sistemas text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_roles_crm_sistemas_check') then
    alter table user_roles add constraint user_roles_crm_sistemas_check
      check (crm_sistemas is null or crm_sistemas <@ array['atacado', 'encomenda']::text[]);
  end if;
end $$;

-- ---------------------------------------------------------------- funções
-- sistemas do executivo logado: a lista nova, ou o sistema único de antes
create or replace function current_user_crm_sistemas()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    crm_sistemas,
    case when crm_sistema is not null then array[crm_sistema] else array[]::text[] end
  )
  from user_roles where user_id = auth.uid();
$$;

grant execute on function current_user_crm_sistemas() to authenticated;

-- pode ver o sistema p_sistema? (gestão e financeiro veem os dois; executivo só os dele)
create or replace function crm_pode_sistema(p_sistema text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case current_user_crm_papel()
    when 'gestao' then true
    when 'financeiro' then true
    when 'executivo' then coalesce(p_sistema = any(current_user_crm_sistemas()), false)
    else false
  end;
$$;

-- Executivos de um sistema (para a gestão escolher o responsável ao adicionar cliente).
create or replace function crm_executivos(p_sistema text)
returns table(user_id uuid, nome text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not crm_pode_sistema(p_sistema) then
    return;
  end if;
  return query
    select u.user_id, coalesce(nullif(u.nome, ''), u.email)
    from user_roles u
    where u.crm_papel = 'executivo'
      and p_sistema = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end))
    order by 2;
end;
$$;

-- ---------------------------------------------------------------- políticas da carteira (só a comparação com o sistema mudou)
drop policy if exists crm_carteira_select on crm_carteira;
create policy crm_carteira_select on crm_carteira for select to authenticated
  using (
    current_user_crm_papel() in ('gestao', 'financeiro')
    or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = any(current_user_crm_sistemas()))
  );

drop policy if exists crm_carteira_insert on crm_carteira;
create policy crm_carteira_insert on crm_carteira for insert to authenticated
  with check (
    crm_pode_escrever() and (
      current_user_crm_papel() = 'gestao'
      or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = any(current_user_crm_sistemas()))
    )
  );

drop policy if exists crm_carteira_update on crm_carteira;
create policy crm_carteira_update on crm_carteira for update to authenticated
  using (
    crm_pode_escrever() and (
      current_user_crm_papel() = 'gestao'
      or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = any(current_user_crm_sistemas()))
    )
  )
  with check (
    current_user_crm_papel() = 'gestao'
    or (current_user_crm_papel() = 'executivo' and executivo_user_id = auth.uid() and sistema = any(current_user_crm_sistemas()))
  );

-- ---------------------------------------------------------------- confere
select
  (select count(*) from information_schema.columns where table_name = 'user_roles' and column_name = 'crm_sistemas') as coluna_nova,
  (select count(*) from pg_proc where proname = 'current_user_crm_sistemas') as funcao_nova,
  (select count(*) from pg_policies where tablename = 'crm_carteira' and (qual ilike '%current_user_crm_sistemas%' or with_check ilike '%current_user_crm_sistemas%')) as politicas_novas;
