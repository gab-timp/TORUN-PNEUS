-- "saldo em aberto" (base do limite de crédito e de tudo no Financeiro) até hoje era
-- calculado com vendas.valor_recebido -- mas esse campo só existe e só é preenchido
-- quando forma_pagamento = 'BOLETO TRADEMASTER' (é o deságio da financeira, não
-- "quanto o cliente já pagou"). Pra PIX/Cartão/Boleto Próprio ele é sempre nulo, então
-- na prática TODO o faturamento histórico contava como "em aberto" pra sempre.
--
-- Esta migração cria um controle de pagamento de verdade: status_pagamento (marcado à
-- mão quando o dinheiro cai) + data_pagamento (quando foi) + data_vencimento (previsão,
-- usada no Fluxo de Caixa).

alter table vendas add column if not exists status_pagamento text not null default 'em_aberto'
  check (status_pagamento in ('pago','em_aberto'));
alter table vendas add column if not exists data_pagamento date;
alter table vendas add column if not exists data_vencimento date;

-- backfill: só PIX antigo vira "pago" (recebimento imediato, dá pra confiar sem
-- checar um por um). Toda venda antiga de Cartão/Boleto Próprio/Boleto Trademaster
-- fica "em_aberto" (o padrão da coluna) pra revisão manual -- decisão explícita do
-- usuário, mesmo sabendo que isso povoa o Contas a Receber com vendas antigas dessas
-- formas de pagamento até alguém confirmar cada uma.
update vendas set status_pagamento = 'pago' where forma_pagamento = 'PIX';

create index if not exists idx_vendas_status_pagamento on vendas (cliente, status_pagamento);
create index if not exists idx_vendas_data_vencimento on vendas (data_vencimento) where status_pagamento = 'em_aberto';

-- confira: deve mostrar as 3 colunas novas e o backfill batendo só com PIX
select forma_pagamento, status_pagamento, count(*) as qtd
from vendas
group by forma_pagamento, status_pagamento
order by forma_pagamento, status_pagamento;
