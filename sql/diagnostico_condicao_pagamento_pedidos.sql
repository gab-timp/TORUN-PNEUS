-- Diagnóstico (só leitura): quantos pedidos (entregas) têm condicao_pagamento
-- com um valor que NÃO bate com nenhuma das 7 opções novas do seletor
-- (A VISTA / 30 DIAS / 2X / 3X / 4X / 5X / 6X). Esses pedidos vão aparecer com
-- o campo em branco da próxima vez que alguém abrir pra editar -- não some do
-- banco até a pessoa salvar de novo.
--
-- Não inclui pedido com o campo vazio/nulo (esse sempre foi opcional, não é
-- "desencontrado", é só nunca preenchido).

-- 1) Visão geral: quantos batem vs. não batem.
select
  case
    when condicao_pagamento is null or condicao_pagamento = '' then 'vazio (nunca preenchido)'
    when condicao_pagamento in ('A VISTA','30 DIAS','2X','3X','4X','5X','6X') then 'bate com a lista nova'
    else 'NÃO bate -- vai aparecer em branco ao editar'
  end as situacao,
  count(*) as qtd
from entregas
group by 1
order by 1;

-- 2) Lista dos pedidos afetados, com o valor antigo, pra decidir caso a caso
--    (ex.: só avisar quem for mexer, ou vale a pena tentar mapear na mão).
select id, numero_nf, numero_pedido, cliente, etapa, condicao_pagamento, created_at
from entregas
where condicao_pagamento is not null
  and condicao_pagamento <> ''
  and condicao_pagamento not in ('A VISTA','30 DIAS','2X','3X','4X','5X','6X')
order by created_at desc;

-- 3) Valores distintos que não batem, com quantos pedidos cada um -- útil pra
--    ver se dá pra mapear em massa (ex.: "30/60" -> "2X") em vez de um por um.
select condicao_pagamento, count(*) as qtd
from entregas
where condicao_pagamento is not null
  and condicao_pagamento <> ''
  and condicao_pagamento not in ('A VISTA','30 DIAS','2X','3X','4X','5X','6X')
group by condicao_pagamento
order by qtd desc;
