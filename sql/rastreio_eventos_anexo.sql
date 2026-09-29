-- Anexo opcional em cada evento de rastreio (ex: foto da entrega, canhoto assinado,
-- CT-e) -- aparece pro cliente na página pública de rastreio (rastreio.html), não só
-- internamente. Rode no SQL Editor do Supabase.

alter table rastreio_eventos add column if not exists anexo_path text;
alter table rastreio_eventos add column if not exists anexo_nome text;

-- RPC pública passa a incluir a URL do anexo -- bucket público (rastreio-anexos), URL
-- direta sem precisar de signed URL, igual ao catálogo de fotos (CATALOGO_BUCKET).
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
      (select jsonb_agg(jsonb_build_object(
         'texto', r.texto, 'ocorrido_em', r.ocorrido_em,
         'anexo_url', case when r.anexo_path is not null
           then 'https://ypygfgpqaupnjsjxgjfl.supabase.co/storage/v1/object/public/rastreio-anexos/' || r.anexo_path
           else null end,
         'anexo_nome', r.anexo_nome
       ) order by r.ocorrido_em asc)
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

-- Bucket: criar manualmente no Supabase Dashboard
--   Storage > New bucket > nome "rastreio-anexos" > Public bucket = ON
-- (público de propósito -- é isso que o cliente vê na página de rastreio, sem login)

-- Só editor/admin sobe ou apaga arquivo (leitura já é liberada pelo bucket público, sem
-- precisar de policy de select).
drop policy if exists "editor sobe anexo rastreio" on storage.objects;
create policy "editor sobe anexo rastreio" on storage.objects for insert with check (
  bucket_id = 'rastreio-anexos' and current_user_role() = 'editor'
);
drop policy if exists "editor apaga anexo rastreio" on storage.objects;
create policy "editor apaga anexo rastreio" on storage.objects for delete using (
  bucket_id = 'rastreio-anexos' and current_user_role() = 'editor'
);

-- Confira (a RPC deve aparecer, sem erro):
select proname from pg_proc where proname = 'buscar_rastreio_publico';
