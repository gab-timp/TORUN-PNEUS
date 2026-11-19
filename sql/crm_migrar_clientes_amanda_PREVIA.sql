-- CRM: PRÉVIA (só leitura) da migração dos clientes da AMANDA do Atacado para a Encomenda.
-- Nada é alterado. Rode um bloco por vez (o Supabase mostra só o resultado da última consulta).

-- 1) Os clientes da Amanda hoje no Atacado, com o que existe ligado a cada um e se já estão na Encomenda.
--    A coluna "esta_na_lista" marca os 7 do print (os que você pediu); confira se há outros sem marca.
select
  c.cliente,
  c.executivo_nome,
  c.etapa,
  (c.cliente in ('F.M. PNEUS LTDA','JOMED TRANSPORTES E LOGISTICA S/A','MAR PNEUS LTDA',
                 'MSP DISTRIBUIDORA E IMPORTADORA DE PNEUS LTDA','NSA PNEUTEC COMERCIAL LTDA',
                 'STA CAMINHOES RN VEICULOS E SERVICOS LTDA','UNICAP PNEUS LTDA')) as esta_na_lista,
  (select count(*) from crm_ligacoes   x where x.sistema = c.sistema and x.cliente = c.cliente) as ligacoes,
  (select count(*) from crm_negociacoes x where x.sistema = c.sistema and x.cliente = c.cliente) as contatos_kanban,
  (select count(*) from crm_contatos   x where x.sistema = c.sistema and x.cliente = c.cliente) as contatos,
  (select count(*) from crm_faturamento_itens x where x.sistema = c.sistema and x.cliente = c.cliente) as lancamentos_faturamento,
  exists (select 1 from crm_carteira e where e.sistema = 'encomenda' and e.cliente = c.cliente) as ja_esta_na_encomenda
from crm_carteira c
where c.sistema = 'atacado' and c.executivo_nome ilike '%amanda%'
order by esta_na_lista desc, c.cliente;

-- 2) A Amanda atende a Encomenda? (se não, os clientes sumiriam da tela dela depois de migrar)
select user_id, nome, email, crm_papel, crm_sistema, crm_sistemas, crm_tem_carteira
from user_roles
where nome ilike '%amanda%' or email ilike '%amanda%';
