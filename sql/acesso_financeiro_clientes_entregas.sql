-- Ajusta o acesso do login financeiro@timptrade.com.br:
--   * ganha a tela Clientes e a tela Entregas;
--   * perde a tela Comissões;
--   * em Entregas só enxerga as etapas Análise de Crédito e Aguardando Pagamento (e manda o pedido, no
--     máximo, pra etapa seguinte: Validação de Transporte; não cria nem cancela pedido).
--
-- 1) Cria user_roles.visible_etapas (lista de etapas de Entregas que o usuário enxerga; vazio = todas).
--    Coluna nova e opcional: nenhum outro usuário muda.
-- 2) Atualiza só a linha do financeiro (telas + etapas).
--
-- Ordem: rode este SQL ANTES ou junto do deploy do site (app.js?v=252 em diante). Se o site novo chegar
-- primeiro, nada quebra, mas as etapas ficam sem restrição até o SQL rodar.
--
-- Depois dá pra mudar as telas pela aba Administração; as etapas por enquanto só por SQL.
--
-- Rode no SQL Editor do Supabase.

alter table user_roles add column if not exists visible_etapas text[];

do $$
declare
  v_id uuid;
  v_tipo_views text;
  v_views text := '["faturamento","limitecredito","contasreceber","historicocredito","fluxocaixa","clientes","entregas"]';
  v_etapas text := '["ANALISE_CREDITO","AGUARDANDO_PAGAMENTO"]';
begin
  select user_id into v_id from user_roles where email = 'financeiro@timptrade.com.br';
  if v_id is null then
    raise exception 'financeiro@timptrade.com.br não tem linha em user_roles; rode antes sql/adicionar_usuario_financeiro.sql.';
  end if;

  -- visible_views aceita array de texto ou jsonb; escolhe o formato da coluna
  select data_type into v_tipo_views from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'visible_views';

  execute format('update user_roles set visible_views = %s where user_id = %L',
    case when v_tipo_views = 'jsonb' then format('%L::jsonb', v_views)
         else format('array(select jsonb_array_elements_text(%L::jsonb))', v_views) end, v_id);

  update user_roles set visible_etapas = array(select jsonb_array_elements_text(v_etapas::jsonb)) where user_id = v_id;
end $$;

-- Confira (deve vir 1 linha: 7 telas sem comissoes, e as 2 etapas):
select user_id, email, nome, role, is_admin, visible_views, visible_etapas
from user_roles
where email = 'financeiro@timptrade.com.br';
