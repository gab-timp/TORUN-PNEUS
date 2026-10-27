-- SEM VENDA: forma de pagamento da reserva, no modelo do Varejo (troca a "condição de pagamento" em texto).
--
-- sv_reservas ganha:
--   forma_pagamento   'PIX' | 'CARTÃO' | 'BOLETO PRÓPRIO' | 'BOLETO TRADEMASTER' (as mesmas formas do Varejo), escolhida na reserva
--                     e confirmada/ajustada ao Confirmar venda.
--   divisao_pagamento jsonb [{ "forma_pagamento": "...", "valor": 123.45 }, ...]: quando a venda foi paga em mais de uma
--                     forma (a soma bate com o total da venda). Vazio = pago numa forma só.
--   valor_recebido    numeric: só para Boleto Trademaster (a diferença para o total da venda é o deságio da financeira).
--
-- O Sem Venda NÃO faz controle financeiro: não há parcelas, vencimento nem status de pagamento.
-- A coluna antiga condicao_pagamento e a tabela sv_condicoes_pagamento FICAM no banco, sem uso novo: as reservas feitas
-- com a lista antiga continuam mostrando o texto antigo ("condição antiga") na tela.
--
-- Aditivo: dá pra rodar antes do deploy. Rode ANTES de abrir o preview novo: a tela nova grava forma_pagamento ao
-- reservar e falha sem a coluna.

alter table sv_reservas add column if not exists forma_pagamento text;
alter table sv_reservas add column if not exists divisao_pagamento jsonb;
alter table sv_reservas add column if not exists valor_recebido numeric;

-- só as 4 formas (vazio vale para as reservas antigas)
alter table sv_reservas drop constraint if exists sv_reservas_forma_pagamento_check;
alter table sv_reservas add constraint sv_reservas_forma_pagamento_check
  check (forma_pagamento is null or forma_pagamento in ('PIX', 'CARTÃO', 'BOLETO PRÓPRIO', 'BOLETO TRADEMASTER'));

-- valor recebido não pode ser negativo
alter table sv_reservas drop constraint if exists sv_reservas_valor_recebido_check;
alter table sv_reservas add constraint sv_reservas_valor_recebido_check
  check (valor_recebido is null or valor_recebido >= 0);

notify pgrst, 'reload schema';

-- Confere (deve listar 3 colunas novas em sv_reservas e as 2 regras):
select 'colunas novas em sv_reservas' as item, count(*)::text as valor
  from information_schema.columns
  where table_name = 'sv_reservas' and column_name in ('forma_pagamento', 'divisao_pagamento', 'valor_recebido')
union all
select 'regras (forma e valor recebido)', count(*)::text
  from pg_constraint where conname in ('sv_reservas_forma_pagamento_check', 'sv_reservas_valor_recebido_check');
