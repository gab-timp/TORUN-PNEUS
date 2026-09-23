-- Reforço defensivo: se um dia existir NF duplicada pro mesmo CNPJ/CPF (ex: NF cancelada e
-- reemitida), a busca pública passa a pegar sempre o pedido mais recente, em vez de um
-- resultado arbitrário. Não muda nada no caso normal (sem duplicata).
--
-- Rode no SQL Editor do Supabase.

create or replace function buscar_rastreio_publico(p_nf text, p_documento text)
returns table (
  numero_nf text,
  numero_pedido text,
  cliente text,
  destino text,
  data_prevista date,
  eventos jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select e.numero_nf, e.numero_pedido, e.cliente, e.destino, e.data_prevista,
    coalesce(
      (select jsonb_agg(jsonb_build_object('texto', r.texto, 'ocorrido_em', r.ocorrido_em) order by r.ocorrido_em asc)
       from rastreio_eventos r where r.entrega_id = e.id),
      '[]'::jsonb
    ) as eventos
  from entregas e
  where trim(coalesce(p_nf, '')) <> ''
    and regexp_replace(coalesce(p_documento, ''), '\D', '', 'g') <> ''
    and trim(e.numero_nf) = trim(p_nf)
    and regexp_replace(coalesce(e.documento_cliente, ''), '\D', '', 'g') = regexp_replace(p_documento, '\D', '', 'g')
    and not e.cancelado
  order by e.created_at desc nulls last
  limit 1;
$$;

-- Confira (deve aparecer, sem erro):
select proname from pg_proc where proname = 'buscar_rastreio_publico';
