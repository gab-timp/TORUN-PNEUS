-- Rastreio público: o cliente consulta pela NF + CNPJ/CPF, sem precisar de login. A linha do
-- tempo é lançada manualmente pela equipe interna, dentro do próprio pedido em Entregas.
-- Reaproveita "Previsão de entrega" (entregas.data_prevista), que já existe -- não cria campo novo
-- pra isso, só devolve ele na busca pública também.
--
-- Rode no SQL Editor do Supabase.

create table if not exists rastreio_eventos (
  id uuid primary key default gen_random_uuid(),
  entrega_id text not null references entregas(id) on delete cascade,
  texto text not null,
  ocorrido_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists rastreio_eventos_entrega_id_idx on rastreio_eventos (entrega_id);

alter table rastreio_eventos enable row level security;

drop policy if exists "autenticado le rastreio" on rastreio_eventos;
create policy "autenticado le rastreio" on rastreio_eventos for select
  using (auth.role() = 'authenticated');

drop policy if exists "editor insere rastreio" on rastreio_eventos;
create policy "editor insere rastreio" on rastreio_eventos for insert
  with check (current_user_role() = 'editor' and created_by = auth.uid());

drop policy if exists "editor apaga rastreio" on rastreio_eventos;
create policy "editor apaga rastreio" on rastreio_eventos for delete
  using (current_user_role() = 'editor');

alter publication supabase_realtime add table rastreio_eventos;

-- Busca pública: recebe NF + CNPJ/CPF, só devolve algo se os dois baterem no mesmo pedido.
-- `security definer` de propósito -- assim NÃO precisamos (e não devemos) abrir uma policy de
-- leitura anônima em `entregas`/`rastreio_eventos`. Quem não sabe os dois dados de um pedido
-- específico não consegue "varrer" a tabela pra achar pedidos de outros clientes.
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
  limit 1;
$$;

revoke all on function buscar_rastreio_publico(text, text) from public;
grant execute on function buscar_rastreio_publico(text, text) to anon, authenticated;

-- Confira (deve aparecer a tabela e a função):
select tablename from pg_tables where tablename = 'rastreio_eventos';
select proname from pg_proc where proname = 'buscar_rastreio_publico';
