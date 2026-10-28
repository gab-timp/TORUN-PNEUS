-- CRM: gestão com carteira própria.
--
-- A gestão continua lendo todas as carteiras e redistribuindo. Um interruptor por pessoa (user_roles.crm_tem_carteira,
-- ligado em Administração > Editar acesso) dá a ela também clientes próprios:
--   * aparece na lista de responsáveis ao adicionar cliente (crm_executivos);
--   * registra ligação nos clientes em que ELA é a responsável (política de crm_ligacoes).
-- Nos clientes dos outros a gestão segue só lendo.
--
-- A carteira, os contatos e o histórico de etapas já aceitam a gestão, então não mudam.
--
-- Aditivo: 1 coluna nova (padrão desligado), 1 função nova, 1 função redefinida (crm_executivos) e 1 política
-- redefinida (crm_ligacoes_insert). Pode rodar antes ou depois do deploy do site; sem o SQL o interruptor não aparece.
-- IMPORTANTE: rode DEPOIS de sql/crm_executivo_dois_sistemas.sql (a crm_executivos daqui a substitui e já inclui a lista
-- de sistemas do executivo).
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

alter table user_roles add column if not exists crm_tem_carteira boolean not null default false;

-- a pessoa logada é gestão (ou administrador sem papel, que conta como gestão) e ligou a carteira própria?
create or replace function current_user_crm_gestao_com_carteira()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select crm_tem_carteira from user_roles where user_id = auth.uid()) and current_user_crm_papel() = 'gestao',
    false
  );
$$;

grant execute on function current_user_crm_gestao_com_carteira() to authenticated;

-- responsáveis possíveis de um sistema: executivos dele e a gestão com carteira própria (que atua nos dois sistemas)
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
    where (
        u.crm_papel = 'executivo'
        and p_sistema = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end))
      )
      or (
        u.crm_tem_carteira
        and coalesce(u.crm_papel, case when u.is_admin then 'gestao' end) = 'gestao'
      )
    order by 2;
end;
$$;

-- só o responsável pelo cliente registra ligação: o executivo dele ou a gestão com carteira própria
drop policy if exists crm_ligacoes_insert on crm_ligacoes;
create policy crm_ligacoes_insert on crm_ligacoes for insert to authenticated
  with check (
    crm_pode_escrever()
    and (current_user_crm_papel() = 'executivo' or current_user_crm_gestao_com_carteira())
    and executivo_user_id = auth.uid()
    and exists (select 1 from crm_carteira c where c.sistema = crm_ligacoes.sistema and c.cliente = crm_ligacoes.cliente and c.executivo_user_id = auth.uid())
  );

-- ---------------------------------------------------------------- confere
select
  (select count(*) from information_schema.columns where table_name = 'user_roles' and column_name = 'crm_tem_carteira') as coluna_nova,
  (select count(*) from pg_proc where proname = 'current_user_crm_gestao_com_carteira') as funcao_nova,
  (select count(*) from pg_policies where tablename = 'crm_ligacoes' and policyname = 'crm_ligacoes_insert' and with_check ilike '%gestao_com_carteira%') as politica_nova;
