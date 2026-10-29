-- Sem Venda: pedido TOTAL ou PARCIAL na reserva e na confirmação da venda.
--
-- Na reserva a pessoa marca se o cliente leva tudo de uma vez (TOTAL, o padrão e o que valem as reservas
-- antigas) ou em partes (PARCIAL). Ao confirmar a venda dá para vender só uma parte; aí a reserva é DIVIDIDA:
--   - as unidades vendidas viram uma linha nova VENDIDA (com o preço, a forma de pagamento e o transporte dessa venda);
--   - as que sobraram continuam reservadas (a própria reserva fica só com o restante) ou são liberadas
--     (a reserva vira CANCELADA com liberada = true, e a tela mostra "Liberada").
-- Tudo acontece numa função só (sv_vender_parcial), de uma vez: nunca fica metade feito.
--
-- Colunas novas em sv_reservas (todas opcionais, nada existente muda):
--   tipo_pedido        TOTAL | PARCIAL (padrão TOTAL)
--   pedido_total       quantidade do pedido original, gravada na primeira venda parcial (mostra "40 de 100")
--   reserva_origem_id  a reserva de onde a linha vendida saiu
--   liberada           true quando o restante foi devolvido ao estoque
--
-- Rode este SQL ANTES de publicar o site: a tela de reserva passa a gravar tipo_pedido, e sem a coluna o
-- "Reservar" falha. Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

alter table sv_reservas add column if not exists tipo_pedido text not null default 'TOTAL';
alter table sv_reservas add column if not exists pedido_total integer;
alter table sv_reservas add column if not exists reserva_origem_id text references sv_reservas(id) on delete set null;
alter table sv_reservas add column if not exists liberada boolean not null default false;

alter table sv_reservas drop constraint if exists sv_reservas_tipo_pedido_check;
alter table sv_reservas add constraint sv_reservas_tipo_pedido_check check (tipo_pedido in ('TOTAL', 'PARCIAL'));
alter table sv_reservas drop constraint if exists sv_reservas_pedido_total_check;
alter table sv_reservas add constraint sv_reservas_pedido_total_check check (pedido_total is null or pedido_total > 0);

create index if not exists sv_reservas_origem_idx on sv_reservas (reserva_origem_id);

-- ---------------------------------------------------------------- venda parcial
create or replace function sv_vender_parcial(
  p_id text,                 -- a reserva ATIVA
  p_novo_id text,            -- id da linha vendida (gerado pela tela)
  p_quantidade integer,      -- unidades vendidas agora (de 1 até a reservada menos 1)
  p_sobra text,              -- 'MANTER' (restante continua reservado) ou 'LIBERAR' (volta pro estoque)
  p_preco numeric,
  p_forma text,
  p_valor_recebido numeric,
  p_divisao jsonb,
  p_tipo_transporte text,
  p_transportadora text,
  p_vendido_em date
)
returns setof sv_reservas
language plpgsql
security definer
set search_path = public
as $$
declare
  r sv_reservas%rowtype;
begin
  -- mesma regra das políticas da tabela: quem tem acesso ao Sem Venda e pode editar
  if not (current_user_pode_acessar_sem_venda() and current_user_role() = 'editor') then
    raise exception 'Sem permissão para confirmar venda.' using errcode = '42501';
  end if;

  select * into r from sv_reservas where id = p_id for update;
  if not found then
    raise exception 'Reserva não encontrada.';
  end if;
  if r.situacao <> 'ATIVA' then
    raise exception 'Essa reserva já foi alterada por outra pessoa.';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade >= r.quantidade then
    raise exception 'A venda parcial vai de 1 até % un.', r.quantidade - 1;
  end if;
  if p_sobra is null or p_sobra not in ('MANTER', 'LIBERAR') then
    raise exception 'Escolha o que fazer com as unidades que sobraram.';
  end if;
  if p_preco is null or p_preco < 0 then
    raise exception 'Informe o preço por unidade.';
  end if;
  if p_forma is null or p_tipo_transporte is null or p_transportadora is null then
    raise exception 'Forma de pagamento, tipo de transporte e transportadora são obrigatórios.';
  end if;
  if p_novo_id is null or exists (select 1 from sv_reservas where id = p_novo_id) then
    raise exception 'Identificador da venda inválido.';
  end if;

  -- a linha vendida
  insert into sv_reservas (
    id, codigo, quantidade, cliente, responsavel, armazem, previsao_id, situacao, data, obs, created_by,
    vendedor_interno, representante, unidade_negocio, condicao_pagamento,
    forma_pagamento, divisao_pagamento, valor_recebido, tipo_transporte, transportadora,
    preco_unitario, vendido_em, tipo_pedido, pedido_total, reserva_origem_id
  ) values (
    p_novo_id, r.codigo, p_quantidade, r.cliente, r.responsavel, r.armazem, r.previsao_id, 'VENDIDA', r.data, r.obs, auth.uid(),
    r.vendedor_interno, r.representante, r.unidade_negocio, r.condicao_pagamento,
    p_forma, p_divisao, p_valor_recebido, p_tipo_transporte, p_transportadora,
    p_preco, coalesce(p_vendido_em, current_date), 'PARCIAL', coalesce(r.pedido_total, r.quantidade), r.id
  );

  -- o que sobrou: continua reservado ou é liberado
  update sv_reservas
     set quantidade = r.quantidade - p_quantidade,
         pedido_total = coalesce(r.pedido_total, r.quantidade),
         tipo_pedido = 'PARCIAL',
         situacao = case when p_sobra = 'LIBERAR' then 'CANCELADA' else 'ATIVA' end,
         liberada = (p_sobra = 'LIBERAR')
   where id = r.id;

  return query select * from sv_reservas where id in (r.id, p_novo_id);
end;
$$;

revoke all on function sv_vender_parcial(text, text, integer, text, numeric, text, numeric, jsonb, text, text, date) from public;
grant execute on function sv_vender_parcial(text, text, integer, text, numeric, text, numeric, jsonb, text, text, date) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 4 from information_schema.columns where table_name = 'sv_reservas' and column_name in ('tipo_pedido', 'pedido_total', 'reserva_origem_id', 'liberada')) as colunas,
  (select count(*) = 2 from pg_constraint where conname in ('sv_reservas_tipo_pedido_check', 'sv_reservas_pedido_total_check')) as constraints,
  (select count(*) = 1 from pg_proc where proname = 'sv_vender_parcial') as funcao,
  (select count(*) from sv_reservas where tipo_pedido = 'TOTAL') as reservas_total;
