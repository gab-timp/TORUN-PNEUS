-- Preços: Frota/TTD e Revenda viram uma tabela só.
--
-- O site novo busca o preço de cliente Frota/TTD na tabela de Revenda (produtos_precos com
-- tipo_cliente = 'REVENDA') e o editor de preços passa a ter 2 abas (Consumo e Revenda/Frota/TTD).
-- O CLIENTE continua classificado como Consumo, Frota/TTD ou Revenda -- só a tabela de preços é uma.
--
-- Rode UM PASSO POR VEZ no SQL Editor do Supabase (ele mostra só o resultado da última consulta).
--
-- PASSO 1 -- conferência (não altera nada). Cada linha é um preço que existe só em Revenda, só em
-- Frota/TTD ou com valor diferente nos dois. SEM LINHAS = as duas tabelas são idênticas e o PASSO 2 pode
-- rodar. Se aparecer linha, me mande o resultado e decidimos item a item antes do PASSO 2.

select coalesce(r.codigo, f.codigo) as codigo,
       coalesce(r.regiao, f.regiao) as regiao,
       coalesce(r.condicao_pagamento, f.condicao_pagamento) as condicao,
       r.preco as preco_revenda,
       f.preco as preco_frota,
       case when r.preco is null then 'só existe em Frota/TTD'
            when f.preco is null then 'só existe em Revenda'
            else 'preços diferentes' end as problema
from (select * from produtos_precos where tipo_cliente = 'REVENDA') r
full outer join (select * from produtos_precos where tipo_cliente = 'FROTA') f
  on f.codigo = r.codigo and f.regiao = r.regiao and f.condicao_pagamento = r.condicao_pagamento
where r.preco is distinct from f.preco
order by 1, 2, 3;

-- PASSO 2 -- migração. Se ainda existir preço DIFERENTE entre Revenda e Frota/TTD, ela para com erro
-- e não muda nada (a escolha de qual vale é sua, não do SQL). Preço que existe só em Frota/TTD é copiado
-- pra Revenda antes de apagar a linha de Frota/TTD, pra nenhum preço sumir. Rode junto com a
-- publicação do site novo.

do $$
declare
  diferentes integer;
begin
  select count(*) into diferentes
  from produtos_precos r
  join produtos_precos f
    on f.codigo = r.codigo and f.regiao = r.regiao and f.condicao_pagamento = r.condicao_pagamento
  where r.tipo_cliente = 'REVENDA' and f.tipo_cliente = 'FROTA' and r.preco <> f.preco;

  if diferentes > 0 then
    raise exception 'Existem % preço(s) diferente(s) entre Revenda e Frota/TTD. Resolva antes (rode o PASSO 1).', diferentes;
  end if;

  insert into produtos_precos (codigo, regiao, tipo_cliente, condicao_pagamento, preco, tabela_referencia, atualizado_em)
  select f.codigo, f.regiao, 'REVENDA', f.condicao_pagamento, f.preco, f.tabela_referencia, now()
  from produtos_precos f
  where f.tipo_cliente = 'FROTA'
    and not exists (
      select 1 from produtos_precos r
      where r.tipo_cliente = 'REVENDA' and r.codigo = f.codigo and r.regiao = f.regiao
        and r.condicao_pagamento = f.condicao_pagamento
    );

  delete from produtos_precos where tipo_cliente = 'FROTA';
end $$;

-- PASSO 3 -- conferência final (deve mostrar só CONSUMO e REVENDA, nenhuma linha FROTA):
select tipo_cliente, count(*) as precos
from produtos_precos
group by tipo_cliente
order by tipo_cliente;
