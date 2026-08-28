-- Achado numa revisão de código (agente dedicado a Entregas/Kanban), defesa em
-- profundidade -- não é alcançável pela UI de hoje, mas é uma inconsistência real
-- dentro da própria trigger sincronizar_estoque_pedido()
-- (baixa_automatica_e_cancelamento_pedidos.sql).
--
-- No passo "recalcula após edição do pedido", o loop que soma quantidade por
-- código já filtra "quantidade > 0" (item com quantidade zero é ignorado,
-- correto). Mas o DELETE que remove código que saiu do pedido só olha se o
-- código ainda aparece em NEW.itens -- sem o mesmo filtro de quantidade. Se um
-- item ficasse com quantidade 0 mas o código continuasse no array (hoje isso
-- nunca acontece: tanto site/app.js quanto site/pedido-representante.js
-- bloqueiam salvar uma medida com quantidade <= 0 antes de chegar aqui), a
-- movimentação antiga desse código não seria nem atualizada (pulada pelo loop)
-- nem removida (o DELETE ainda o considera "presente") -- ficaria baixando
-- estoque pra sempre com a quantidade errada, antiga.
--
-- Este script só reaplica a função com o mesmo filtro (quantidade > 0) também
-- no DELETE, deixando as duas consultas consistentes entre si. Idempotente,
-- pode rodar a qualquer momento. Rode no SQL Editor do Supabase.

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
  r record;
  linhas_afetadas int;
begin
  if TG_OP = 'UPDATE' then
    estava_cancelado := coalesce(OLD.cancelado, false);
    itens_mudaram := NEW.itens is distinct from OLD.itens;

    if estava_cancelado and not coalesce(NEW.cancelado, false) then
      raise exception 'Não é possível reativar um pedido cancelado.';
    end if;

    if not itens_mudaram
       and NEW.etapa is not distinct from OLD.etapa
       and coalesce(NEW.cancelado, false) is not distinct from estava_cancelado then
      return NEW;
    end if;
  else
    estava_cancelado := false;
    itens_mudaram := false;
  end if;

  idx_new := array_position(ordem, NEW.etapa);
  passou_ag := idx_new is not null and idx_new > idx_ag;

  ja_deduziu := exists (
    select 1 from movimentos where entrega_id = NEW.id and tipo = 'venda'
  );

  if coalesce(NEW.cancelado, false) and not estava_cancelado then
    if ja_deduziu then
      insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, obs, entrega_id, created_by)
      select
        'mov_' || gen_random_uuid(),
        current_date, 'entrada', m.codigo, m.quantidade,
        NEW.numero_nf, NEW.numero_pedido,
        'Estorno automático — pedido cancelado'
          || case when NEW.cancelado_motivo is not null and NEW.cancelado_motivo <> ''
                   then ' (' || NEW.cancelado_motivo || ')' else '' end,
        NEW.id, auth.uid()
      from movimentos m
      where m.entrega_id = NEW.id and m.tipo = 'venda';
    end if;
    return NEW;
  end if;

  if estava_cancelado then
    return NEW;
  end if;

  if ja_deduziu and itens_mudaram then
    for r in
      select item->>'codigo' as codigo, sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo'
    loop
      update movimentos
        set quantidade = r.quantidade,
            obs = 'Baixa automática de estoque — recalculada após edição do pedido'
        where entrega_id = NEW.id and tipo = 'venda' and codigo = r.codigo;
      get diagnostics linhas_afetadas = row_count;
      if linhas_afetadas = 0 then
        insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, obs, entrega_id, created_by)
        values (
          'mov_' || gen_random_uuid(),
          current_date, 'venda', r.codigo, r.quantidade,
          NEW.numero_nf, NEW.numero_pedido,
          'Baixa automática de estoque — recalculada após edição do pedido',
          NEW.id, auth.uid()
        );
      end if;
    end loop;

    -- Remove código que saiu do pedido -- agora com o MESMO filtro de
    -- quantidade > 0 do loop acima, pra não deixar código com quantidade
    -- zerada "preso" contando como presente (correção deste script).
    delete from movimentos
    where entrega_id = NEW.id and tipo = 'venda'
      and codigo not in (
        select item->>'codigo'
        from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
        where item->>'codigo' is not null
          and coalesce((item->>'quantidade')::numeric, 0) > 0
      );
    return NEW;
  end if;

  if ja_deduziu and TG_OP = 'UPDATE' then
    if (NEW.numero_nf is distinct from OLD.numero_nf or NEW.numero_pedido is distinct from OLD.numero_pedido) then
      update movimentos
        set numero = NEW.numero_nf, pedido = NEW.numero_pedido
        where entrega_id = NEW.id and tipo = 'venda';
      return NEW;
    end if;
  end if;

  if passou_ag and not ja_deduziu then
    insert into movimentos (id, data, tipo, codigo, quantidade, numero, pedido, obs, entrega_id, created_by)
    select
      'mov_' || gen_random_uuid(),
      current_date, 'venda', agregados.codigo, agregados.quantidade,
      NEW.numero_nf, NEW.numero_pedido, 'Baixa automática de estoque — pedido autorizado',
      NEW.id, auth.uid()
    from (
      select item->>'codigo' as codigo, sum((item->>'quantidade')::numeric) as quantidade
      from jsonb_array_elements(coalesce(NEW.itens, '[]'::jsonb)) as item
      where item->>'codigo' is not null
        and coalesce((item->>'quantidade')::numeric, 0) > 0
      group by item->>'codigo'
    ) as agregados;
  end if;

  return NEW;
end;
$$;

-- O trigger em si não muda (continua after insert or update). Recriar aqui
-- também por segurança, caso este script rode sozinho:
drop trigger if exists trg_sincronizar_estoque_pedido on entregas;
create trigger trg_sincronizar_estoque_pedido
after insert or update on entregas
for each row
execute function sincronizar_estoque_pedido();
