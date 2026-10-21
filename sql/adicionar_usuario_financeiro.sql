-- Cria a linha de permissões do login financeiro@timptrade.com.br.
--
-- Acesso: só o grupo Financeiro do menu (Faturamento, Limite de Crédito, Contas a Receber,
-- Comissões, Histórico de Crédito e Fluxo de Caixa). Entra direto em Faturamento. Papel Editor
-- (precisa baixar pagamento e registrar análise de crédito), não-admin, sem acesso ao Sem Venda,
-- sem autorizações extras e sem backup.
--
-- editable_tables fica em branco DE PROPÓSITO: com essa lista preenchida o sistema esconde todo botão
-- de escrita que não esteja dentro de uma tela ligada a uma tabela da lista, e Limite de Crédito e
-- Contas a Receber não são ligadas a nenhuma (o "Marcar como pago" e o "Registrar análise de
-- crédito" sumiriam). Dá pra ajustar tudo depois pela aba Administração, sem SQL de novo.
--
-- Pré-requisito: o login financeiro@timptrade.com.br já precisa existir no Supabase Auth
-- (Authentication > Users > Add user, com "Auto Confirm User" marcado). Sem isso o bloco avisa e
-- não insere nada. A senha é definida lá, não aqui.
--
-- Rode no SQL Editor do Supabase.

do $$
declare
  v_id uuid;
  v_tipo_views text;
  v_views text := '["faturamento","limitecredito","contasreceber","comissoes","historicocredito","fluxocaixa"]';
begin
  select id into v_id from auth.users where email = 'financeiro@timptrade.com.br';
  if v_id is null then
    raise exception 'Crie primeiro o login financeiro@timptrade.com.br em Authentication > Users (Auto Confirm User marcado).';
  end if;
  if exists (select 1 from user_roles where user_id = v_id) then
    raise exception 'financeiro@timptrade.com.br já tem linha em user_roles; ajuste pela aba Administração.';
  end if;

  -- visible_views aceita array de texto ou jsonb; escolhe o formato da coluna
  select data_type into v_tipo_views from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'visible_views';

  insert into user_roles (user_id, email, nome, role, is_admin, pode_autorizar_gerencia, pode_exportar_backup)
  values (v_id, 'financeiro@timptrade.com.br', 'Financeiro', 'editor', false, false, false);

  execute format('update user_roles set visible_views = %s where user_id = %L',
    case when v_tipo_views = 'jsonb' then format('%L::jsonb', v_views)
         else format('array(select jsonb_array_elements_text(%L::jsonb))', v_views) end, v_id);
end $$;

-- Confira (deve vir 1 linha: editor, não-admin, 6 telas, editable_tables vazio):
select user_id, email, nome, role, is_admin, visible_views, editable_tables, pode_autorizar_gerencia, pode_exportar_backup
from user_roles
where email = 'financeiro@timptrade.com.br';
