-- Diagnóstico (só leitura) do bug corrigido em
-- sql/corrige_processo_na_baixa_automatica.sql: quantas baixas automáticas de
-- estoque já saíram sem o número do processo, mesmo a medida do pedido tendo
-- um processo informado. Rode no SQL Editor do Supabase.

-- 1) Visão geral: quantas movimentações automáticas existem, e quantas delas
-- já têm processo preenchido hoje.
select
  count(*) as total_movimentacoes_automaticas,
  count(*) filter (where processo is not null and processo <> '') as com_processo,
  count(*) filter (where processo is null or processo = '') as sem_processo
from movimentos
where entrega_id is not null and tipo = 'venda';

-- 2) Candidatos reais: movimentação automática SEM processo, cujo pedido de
-- origem tem pelo menos uma medida daquele código COM processo informado --
-- ou seja, a informação existia em entregas.itens, só não foi parar na
-- movimentação. Essas são as afetadas de verdade pelo bug.
select
  m.id as movimento_id, m.codigo, m.quantidade, m.data, m.numero as nf_venda,
  e.id as pedido_id, e.numero_pedido, e.numero_nf, e.cliente, e.created_at as pedido_criado_em,
  (
    select jsonb_agg(jsonb_build_object('processo', it->>'processo', 'quantidade', it->>'quantidade'))
    from jsonb_array_elements(e.itens) it
    where it->>'codigo' = m.codigo
  ) as itens_desse_codigo_no_pedido
from movimentos m
join entregas e on e.id = m.entrega_id
where m.tipo = 'venda'
  and (m.processo is null or m.processo = '')
  and exists (
    select 1 from jsonb_array_elements(e.itens) it
    where it->>'codigo' = m.codigo
      and it->>'processo' is not null and it->>'processo' <> ''
  )
order by m.data desc;

-- 3) Dentro dos candidatos de (2), destaca os casos "fáceis de corrigir na mão"
-- (só um processo possível pra aquele código naquele pedido -- um UPDATE direto
-- resolve) dos "complicados" (o mesmo código aparece no pedido ligado a MAIS DE
-- UM processo -- a movimentação de hoje juntou tudo numa quantidade só, então
-- corrigir direito exige separar em mais de uma linha, não só preencher um
-- campo). Rode (2) primeiro pra ver a lista; esta aqui só resume a contagem.
select
  case when jsonb_array_length(sub.processos_distintos) = 1 then 'fácil (1 processo só)'
       else 'complicado (' || jsonb_array_length(sub.processos_distintos) || ' processos diferentes)'
  end as categoria,
  count(*) as quantidade_de_movimentacoes
from (
  select
    m.id,
    (
      select jsonb_agg(distinct it->>'processo')
      from jsonb_array_elements(e.itens) it
      where it->>'codigo' = m.codigo and it->>'processo' is not null and it->>'processo' <> ''
    ) as processos_distintos
  from movimentos m
  join entregas e on e.id = m.entrega_id
  where m.tipo = 'venda'
    and (m.processo is null or m.processo = '')
    and exists (
      select 1 from jsonb_array_elements(e.itens) it
      where it->>'codigo' = m.codigo
        and it->>'processo' is not null and it->>'processo' <> ''
    )
) sub
group by 1;
