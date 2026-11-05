-- PRÉVIA da limpeza dos dados de teste do SEM VENDA e do CRM (Atacado e Encomenda).
-- SÓ CONSULTA: este arquivo não apaga, não altera nem cria nada. Rode CADA bloco separado (o Supabase mostra só o
-- resultado da última consulta executada) e me mande o resultado. A limpeza de verdade vem depois, em outro arquivo,
-- só depois de você ver estes números e confirmar.
--
-- O que a limpeza vai apagar (conforme a sua escolha):
--   Sem Venda: processos do Estoque Previsto (sv_previsoes), reservas e vendas (sv_reservas) e fretes (sv_fretes),
--              produtos (sv_produtos) e clientes do Sem Venda (sv_clientes).
--   CRM:       ligações, kanban de contatos e histórico de etapas; faturamento, comissões e links dos representantes;
--              metas; clientes, carteira, contatos, perfil, filiais e pneus (o cadastro de clientes é ÚNICO: apagar os
--              clientes do CRM esvazia a lista de clientes do Sem Venda também).
-- O que fica: vendedores internos, transportadoras, condições de pagamento e os representantes do Sem Venda
--             (sv_vendedores, sv_transportadoras, sv_condicoes_pagamento, sv_representantes), os logins e os papéis dos usuários.

-- ============================================================ BLOCO 1: quanto tem em cada tabela (rode sozinho)
select t.tabela,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tabela), false, true, '')))[1]::text::int as linhas,
       t.grupo
from (values
  ('sv_previsoes', 'Sem Venda: apagar'), ('sv_reservas', 'Sem Venda: apagar'), ('sv_fretes', 'Sem Venda: apagar'),
  ('sv_produtos', 'Sem Venda: apagar'), ('sv_clientes', 'Sem Venda: apagar'),
  ('sv_vendedores', 'Sem Venda: FICA'), ('sv_transportadoras', 'Sem Venda: FICA'),
  ('sv_condicoes_pagamento', 'Sem Venda: FICA'), ('sv_representantes', 'Sem Venda: FICA'),
  ('crm_ligacoes', 'CRM: apagar'), ('crm_negociacoes', 'CRM: apagar'), ('crm_etapa_historico', 'CRM: apagar'),
  ('crm_faturamento_lancamentos', 'CRM: apagar'), ('crm_faturamento_itens', 'CRM: apagar'),
  ('crm_comissao_percentual', 'CRM: apagar'), ('crm_representante_percentual', 'CRM: apagar'),
  ('crm_representante_comissao', 'CRM: apagar'), ('crm_representante_links', 'CRM: apagar'),
  ('crm_meta_equipe', 'CRM: apagar'), ('crm_meta_executivo', 'CRM: apagar'),
  ('crm_meta_mes_equipe', 'CRM: apagar'), ('crm_meta_mes_executivo', 'CRM: apagar'),
  ('crm_cliente_mudancas', 'CRM: apagar'), ('crm_contatos', 'CRM: apagar'), ('crm_cliente_perfil', 'CRM: apagar'),
  ('crm_cliente_filiais', 'CRM: apagar'), ('crm_cliente_pneus', 'CRM: apagar'),
  ('crm_carteira', 'CRM: apagar'), ('crm_clientes', 'CRM: apagar (cadastro único)')
) as t(tabela, grupo)
where to_regclass('public.' || t.tabela) is not null
order by t.grupo, t.tabela;

-- ============================================================ BLOCO 2: quem são os clientes (rode sozinho)
-- Para você ver se há cliente REAL no meio (por exemplo, importado do Torun) antes de apagar o cadastro inteiro.
select k.nome, k.tipo, k.created_at::date as cadastrado_em,
       (select string_agg(distinct c.sistema, ', ') from crm_carteira c where c.cliente = k.nome) as carteira,
       (select count(*) from crm_ligacoes l where l.cliente = k.nome) as ligacoes
from crm_clientes k
order by k.created_at, k.nome
limit 200;

-- ============================================================ BLOCO 3: produtos e processos do Sem Venda (rode sozinho)
select 'produto' as o_que, p.codigo as nome, p.created_at::date as criado_em from sv_produtos p
union all
select 'processo', pr.numero_processo || ' · ' || pr.status, pr.created_at::date from sv_previsoes pr
order by 1, 3, 2
limit 200;
