-- Cria a linha de permissões do login nguedes@nguedes.com.br.
--
-- Acesso: só as telas Estoque, Coleta e Entregas. Papel Editor, não-admin, com escrita liberada
-- só nas tabelas de Coleta (romaneios) e Entregas; no Estoque ele só consulta. Sem acesso ao
-- Sem Venda, sem autorizações extras e sem backup. Dá pra ajustar tudo depois pela aba
-- Administração, sem SQL de novo.
--
-- Pré-requisito: o login nguedes@nguedes.com.br já precisa existir no Supabase Auth
-- (Authentication > Users > Add user, com "Auto Confirm User" marcado). Sem isso o bloco
-- avisa e não insere nada.
--
-- Rode no SQL Editor do Supabase.

do $$
declare
  v_id uuid;
  v_tipo_views text;
  v_tipo_tabelas text;
  v_views text := '["estoque","coleta","entregas"]';
  v_tabelas text := '["entregas","romaneios"]';
begin
  select id into v_id from auth.users where email = 'nguedes@nguedes.com.br';
  if v_id is null then
    raise exception 'Crie primeiro o login nguedes@nguedes.com.br em Authentication > Users (Auto Confirm User marcado).';
  end if;
  if exists (select 1 from user_roles where user_id = v_id) then
    raise exception 'nguedes@nguedes.com.br já tem linha em user_roles; ajuste pela aba Administração.';
  end if;

  -- visible_views e editable_tables aceitam array de texto ou jsonb; escolhe o formato da coluna
  select data_type into v_tipo_views from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'visible_views';
  select data_type into v_tipo_tabelas from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'editable_tables';

  insert into user_roles (user_id, email, nome, role, is_admin, pode_autorizar_gerencia, pode_exportar_backup)
  values (v_id, 'nguedes@nguedes.com.br', 'Nguedes', 'editor', false, false, false);

  execute format('update user_roles set visible_views = %s where user_id = %L',
    case when v_tipo_views = 'jsonb' then format('%L::jsonb', v_views)
         else format('array(select jsonb_array_elements_text(%L::jsonb))', v_views) end, v_id);
  execute format('update user_roles set editable_tables = %s where user_id = %L',
    case when v_tipo_tabelas = 'jsonb' then format('%L::jsonb', v_tabelas)
         else format('array(select jsonb_array_elements_text(%L::jsonb))', v_tabelas) end, v_id);
end $$;

-- Confira (deve vir 1 linha: editor, não-admin, 3 telas, 2 tabelas editáveis):
select user_id, email, nome, role, is_admin, visible_views, editable_tables, pode_autorizar_gerencia, pode_exportar_backup
from user_roles
where email = 'nguedes@nguedes.com.br';
