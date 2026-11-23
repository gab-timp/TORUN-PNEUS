-- SEM VENDA: "Cliente retira" na reserva (frete do cliente / FOB em que ele mesmo busca).
--
--   sv_reservas.cliente_retira  boolean, padrão falso. Só vale com tipo_transporte = CLIENTE; marcado, a transportadora fica vazia.
--   sv_vender_parcial ganha o parâmetro p_cliente_retira (padrão falso) e deixa de exigir transportadora quando ele é verdadeiro.
--
-- ORDEM: rode ANTES de publicar o site novo (semvenda.js). Pré-requisito: sem_venda_pedido_parcial.sql e sem_venda_transporte.sql.
-- Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

alter table sv_reservas add column if not exists cliente_retira boolean not null default false;
alter table sv_reservas drop constraint if exists sv_reservas_cliente_retira_check;
alter table sv_reservas add constraint sv_reservas_cliente_retira_check
  check (not cliente_retira or (tipo_transporte = 'CLIENTE' and transportadora is null));

-- a assinatura mudou (parâmetro novo): tira a antiga para não sobrar duas versões
drop function if exists sv_vender_parcial(text, text, integer, text, numeric, text, numeric, jsonb, text, text, date);

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
  p_vendido_em date,
  p_cliente_retira boolean default false  -- frete do cliente e ele mesmo busca: sem transportadora
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
  if p_forma is null or p_tipo_transporte is null or (p_transportadora is null and not coalesce(p_cliente_retira, false)) then
    raise exception 'Forma de pagamento, tipo de transporte e transportadora são obrigatórios.';
  end if;
  if coalesce(p_cliente_retira, false) and p_tipo_transporte <> 'CLIENTE' then
    raise exception 'Cliente retira só vale com frete do cliente.';
  end if;
  if p_novo_id is null or exists (select 1 from sv_reservas where id = p_novo_id) then
    raise exception 'Identificador da venda inválido.';
  end if;

  -- a linha vendida
  insert into sv_reservas (
    id, codigo, quantidade, cliente, responsavel, armazem, previsao_id, situacao, data, obs, created_by,
    vendedor_interno, representante, unidade_negocio, condicao_pagamento,
    forma_pagamento, divisao_pagamento, valor_recebido, tipo_transporte, transportadora, cliente_retira,
    preco_unitario, vendido_em, tipo_pedido, pedido_total, reserva_origem_id
  ) values (
    p_novo_id, r.codigo, p_quantidade, r.cliente, r.responsavel, r.armazem, r.previsao_id, 'VENDIDA', r.data, r.obs, auth.uid(),
    r.vendedor_interno, r.representante, r.unidade_negocio, r.condicao_pagamento,
    p_forma, p_divisao, p_valor_recebido, p_tipo_transporte, case when coalesce(p_cliente_retira, false) then null else p_transportadora end, coalesce(p_cliente_retira, false),
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

revoke all on function sv_vender_parcial(text, text, integer, text, numeric, text, numeric, jsonb, text, text, date, boolean) from public;
grant execute on function sv_vender_parcial(text, text, integer, text, numeric, text, numeric, jsonb, text, text, date, boolean) to authenticated;

notify pgrst, 'reload schema';

-- confere
select
  (select count(*) = 1 from information_schema.columns where table_name = 'sv_reservas' and column_name = 'cliente_retira') as coluna,
  (select count(*) = 1 from pg_constraint where conname = 'sv_reservas_cliente_retira_check') as regra,
  (select count(*) = 1 from pg_proc where proname = 'sv_vender_parcial') as so_uma_funcao,
  (select count(*) = 1 from pg_proc where proname = 'sv_vender_parcial' and pronargs = 12) as com_12_parametros;
