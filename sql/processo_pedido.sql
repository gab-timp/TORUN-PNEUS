-- Adiciona "Nº do processo" ao pedido (Entregas) e propaga esse valor pra
-- movimentação de estoque que a trigger já gera sozinha (ver
-- sql/baixa_automatica_e_cancelamento_pedidos.sql) -- assim dá pra saber, olhando
-- a movimentação, de qual processo/lote de compra os pneus daquele pedido saíram
-- (mesmo conceito que já existe em movimentos.processo, usado no formulário manual
-- de Entrada/Saída e no "Ver processos" da tela de Estoque).
--
-- Rode este SQL no SQL Editor do Supabase (depois de já ter rodado
-- baixa_automatica_e_cancelamento_pedidos.sql).

-- 1) Coluna nova em entregas.
alter table entregas add column if not exists processo text;

-- 2) Substitui a função da trigger (mesmo trigger, só a função muda) pra:
--    a) gravar entregas.processo na movimentação "venda" quando baixa pela 1ª vez;
--    b) atualizar o processo nas movimentações já lançadas se o campo for editado
--       depois (mesma lógica de "permitir editar e recalcular" já usada pros itens);
--    c) propagar o processo ORIGINAL de cada movimento (não o do pedido no momento
--       do cancelamento) pro estorno -- garante que a "conta por processo" (Estoque
--       > Ver processos) sempre fecha, mesmo que o campo processo do pedido tenha
--       mudado entre a baixa e o cancelamento.
create or replace function sincronizar_estoque_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ordem text[] := array[
    'PRE_VENDA','ENTRADA','AUTORIZACAO_GERENCIA','ANALISE_CREDITO','AGUARDANDO_PAGAMENTO',
    'VALIDACAO_TRANSPORTE','FATURAMENTO','SEPARACAO','AGUARDANDO_COLETA','COLETA','RASTREIO','FINALIZADOS'
  ];
  idx_ag int := array_position(ordem, 'AUTORIZACAO_GERENCIA');
  idx_new int;
  passou_ag boolean;
  ja_deduziu boolean;
  estava_cancelado boolean;
  itens_mudaram boolean;
  processo_mudou boolean;
  r record;
  linhas_afetadas int;
begin
  if TG_OP = 'UPDATE' then
    estava_cancelado := coalesce(OLD.cancelado, false);
    itens_mudaram := NEW.itens is distinct from OLD.itens;
    processo_mudou := NEW.processo is distinct from OLD.processo;

    if estava_cancelado and not coalesce(NEW.cancelado, false) then
      raise exception 'Não é possível reativar um pedido cancelado.';
    end if;

    if not itens_mudaram
       and not processo_mudou
       and NEW.etapa is not distinct from OLD.etapa
       and coalesce(NEW.cancelado, false) is not distinct from estava_cancelado then
      return NEW;
    end if;
  else
    estava_cancelado := false;
    itens_mudaram := false;
    processo_mudou := false;
  end if;

  idx_new := array_position(ordem, NEW.etapa);
  passou_ag := idx_new is not null and idx_new > idx_ag;

  ja_deduziu := exists (
    select 1 from movimentos where entrega_id = NEW.id and tipo = 'venda'
  );

  -- 1) Cancelamento: estorna o que já tinha sido baixado (se houver) e para por aqui.
  -- Usa m.processo (o processo já gravado em cada movimento original), não
  -- NEW.processo, pra manter a conta por processo correta mesmo que o campo
  -- do pedido tenha sido editado depois da baixa.
  if coalesce(NEW.cancelado, false) and not estava_cancelado then
    if ja_deduziu then
      insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
      select
        'mov_' || gen_random_uuid(),
        current_date, 'entrada', m.codigo, m.quantidade,
        NEW.numero_nf, NEW.numero_pedido, m.processo,
        'Estorno automático — pedido cancelado'
          || case when NEW.cancelado_motivo is not null and NEW.cancelado_motivo <> ''
                   then ' (' || NEW.cancelado_motivo || ')' else '' end,
        NEW.id, auth.uid()
      from movimentos m
      where m.entrega_id = NEW.id and m.tipo = 'venda';
    end if;
    return NEW;
  end if;

  -- 2) Já estava cancelado antes (e continua): estado congelado, não mexe em nada.
  if estava_cancelado then
    return NEW;
  end if;

  -- 3) Já tinha baixado antes e os itens e/ou o processo mudaram: recalcula --
  -- INDEPENDENTE da etapa atual (mesmo raciocínio de antes: se o card foi
  -- arrastado pra trás de Autorização de Gerência sem cancelar, a movimentação
  -- já lançada continua tendo que refletir o pedido real).
  if ja_deduziu and (itens_mudaram or processo_mudou) then
    for r in
      select item->>'codigo' as codigo, sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo'
    loop
      update movimentos
        set quantidade = r.quantidade,
            processo = NEW.processo,
            obs = 'Baixa automática de estoque — recalculada após edição do pedido'
        where entrega_id = NEW.id and tipo = 'venda' and codigo = r.codigo;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas = 0 then
        insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
        values (
          'mov_' || gen_random_uuid(),
          current_date, 'venda', r.codigo, r.quantidade,
          NEW.numero_nf, NEW.numero_pedido, NEW.processo,
          'Baixa automática de estoque — recalculada após edição do pedido',
          NEW.id, auth.uid()
        );
      end if;
    end loop;

    -- Remove código que saiu do pedido.
    delete from movimentos
    where entrega_id = NEW.id and tipo = 'venda'
      and codigo not in (
        select item->>'codigo'
        from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
        where item->>'codigo' is not null
      );
    return NEW;
  end if;

  -- 3b) NF/número do pedido chegaram depois (normal -- NF só sai no Faturamento,
  -- que vem DEPOIS de Autorização de Gerência) e nada mais mudou: mantém as
  -- linhas de venda já lançadas com o número atualizado, pra rastreabilidade.
  if ja_deduziu and TG_OP = 'UPDATE' then
    if (NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido) then
      update movimentos
        set numero = NEW.numero_nf, pedido = NEW.numero_pedido
        where entrega_id = NEW.id and tipo = 'venda';
      return NEW;
    end if;
  end if;

  -- 4) Primeira baixa: passou de Autorização de Gerência pela primeira vez.
  if passou_ag and not ja_deduziu then
    insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, processo, obs, entrega_id, created_by)
    select
      'mov_' || gen_random_uuid(),
      current_date, 'venda', agregados.codigo, agregados.quantidade,
      NEW.numero_nf, NEW.numero_pedido, NEW.processo, 'Baixa automática de estoque — pedido autorizado',
      NEW.id, auth.uid()
    from (
      select item->>'codigo' as codigo, sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo'
    ) as agregados;
  end if;

  -- Se não passou_ag e não caiu em nenhum caso acima: card ainda antes/na etapa
  -- Autorização de Gerência, ou foi arrastado de volta pra trás -- não faz nada.
  -- Esperado, não é bug: só "Cancelar pedido" reverte estoque já baixado.
  return NEW;
end;
$$;

-- O trigger em si não muda (já criado em baixa_automatica_e_cancelamento_pedidos.sql),
-- só a função. Recriar aqui também por segurança, caso este script rode sozinho:
drop trigger if exists trg_sincronizar_estoque_pedido on entregas;
create trigger trg_sincronizar_estoque_pedido
after insert or update on entregas
for each row
execute function sincronizar_estoque_pedido();

-- Confira se aplicou:
select column_name from information_schema.columns where table_name = 'entregas' and column_name = 'processo';
