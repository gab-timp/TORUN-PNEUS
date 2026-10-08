-- Corrige o HISTÓRICO das 3 movimentações identificadas por
-- sql/diagnostico_baixa_sem_processo.sql (todas na categoria "fácil", 1 único
-- processo possível cada uma). Só roda depois de já ter rodado
-- sql/corrige_processo_na_baixa_automatica.sql (aquele conserta daqui pra
-- frente; este aqui conserta o que já ficou gravado errado).
--
-- Segurança: só atualiza uma linha se existir exatamente 1 processo distinto
-- possível pra aquele código naquele pedido -- mesmo que o número de linhas
-- afetadas mude entre a hora que você rodou o diagnóstico e agora, não vai
-- tocar num caso "complicado" (mais de um processo) por engano.
--
-- Rode a consulta 1 primeiro (só leitura) pra ver exatamente o que vai mudar.
-- Se bater com o esperado, roda a consulta 2 (o UPDATE de verdade).

-- 1) Prévia -- confere antes de aplicar.
select
  m.id as movimento_id, m.codigo, m.quantidade, m.numero as nf_venda, m.data,
  m.processo as processo_atual, sub.unico_processo as processo_novo,
  e.numero_pedido, e.cliente
from movimentos m
join entregas e on e.id = m.entrega_id
join (
  select m2.id as movimento_id,
    (array_agg(distinct it->>'processo'))[1] as unico_processo,
    count(distinct it->>'processo') as qtd_processos_distintos
  from movimentos m2
  join entregas e2 on e2.id = m2.entrega_id
  join lateral jsonb_array_elements(e2.itens) it on it->>'codigo' = m2.codigo
  where m2.tipo = 'venda'
    and (m2.processo is null or m2.processo = '')
    and it->>'processo' is not null and it->>'processo' <> ''
  group by m2.id
) sub on sub.movimento_id = m.id
where sub.qtd_processos_distintos = 1;

-- 2) Aplica -- só depois de conferir a prévia acima.
update movimentos m
set processo = sub.unico_processo
from (
  select m2.id as movimento_id,
    (array_agg(distinct it->>'processo'))[1] as unico_processo,
    count(distinct it->>'processo') as qtd_processos_distintos
  from movimentos m2
  join entregas e2 on e2.id = m2.entrega_id
  join lateral jsonb_array_elements(e2.itens) it on it->>'codigo' = m2.codigo
  where m2.tipo = 'venda'
    and (m2.processo is null or m2.processo = '')
    and it->>'processo' is not null and it->>'processo' <> ''
  group by m2.id
) sub
where m.id = sub.movimento_id
  and sub.qtd_processos_distintos = 1;

-- 3) Confirma -- deve dar 0 linhas na categoria "fácil" agora (as complicadas,
-- se surgirem no futuro, continuam de fora de propósito).
select count(*) as ainda_sem_processo_facil
from movimentos m
join entregas e on e.id = m.entrega_id
where m.tipo = 'venda'
  and (m.processo is null or m.processo = '')
  and exists (
    select 1 from jsonb_array_elements(e.itens) it
    where it->>'codigo' = m.codigo
      and it->>'processo' is not null and it->>'processo' <> ''
  );
