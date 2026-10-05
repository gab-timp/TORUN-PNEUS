-- Sem Venda, etapa 1: trava de acesso.
--
-- O Sem Venda é um segundo sistema dentro do mesmo login (tela de escolha depois de
-- entrar: TORUN VAREJO ou SEM VENDA). Quem vê a opção Sem Venda é administrador ou
-- quem tiver esta permissão marcada em Administração > Usuários. Mesmo padrão de
-- pode_autorizar_gerencia / pode_exportar_backup: o padrão é false, então ninguém
-- (fora admin) enxerga o Sem Venda até um administrador liberar.
--
-- A função current_user_pode_acessar_sem_venda() é a trava de verdade no banco: as
-- tabelas do Sem Venda (etapas seguintes) vão usá-la nas políticas de RLS, pra o
-- acesso não depender só de esconder o menu na tela.
--
-- Aditivo e seguro: o site atual lê user_roles com lista explícita de colunas e não
-- é afetado. Rode ANTES de abrir o site com a tela de escolha de sistema (ela lê
-- esta coluna). Rode no SQL Editor do Supabase.

alter table user_roles add column if not exists pode_acessar_sem_venda boolean not null default false;

create or replace function current_user_pode_acessar_sem_venda()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin or pode_acessar_sem_venda from user_roles where user_id = auth.uid()),
    false
  );
$$;
grant execute on function current_user_pode_acessar_sem_venda() to authenticated;

-- Confere (deve mostrar a coluna com default false):
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'user_roles' and column_name = 'pode_acessar_sem_venda';
