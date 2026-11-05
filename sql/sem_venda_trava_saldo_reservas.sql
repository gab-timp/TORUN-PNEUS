-- SEM VENDA: trava de saldo NO BANCO para reservas e vendas.
--
-- Hoje a tela confere o saldo antes de gravar, mas nada no banco impedia duas pessoas reservarem a última unidade quase ao
-- mesmo tempo (as duas passavam e o saldo ficava negativo). Este SQL fecha a brecha: toda reserva ou venda gravada passa por
-- uma conferência dentro do banco, com uma trava por medida (só uma gravação de cada vez na mesma medida).
--
-- A conta é a mesma da tela (svCalcularEstoque, semvenda.js):
--   * Processo AINDA A CAMINHO (status diferente de FINALIZADO): o saldo é por processo e produto.
--       disponível = soma das medidas do processo - reservas ATIVAS e VENDIDAS desse processo e produto.
--   * Estoque FÍSICO (processo FINALIZADO, ou reserva direta no armazém): o saldo é por produto e armazém.
--       disponível = soma das medidas dos processos FINALIZADOS do armazém - reservas ATIVAS e VENDIDAS desse produto e armazém
--       (a reserva de um processo já FINALIZADO conta no armazém dele).
--   * Reserva CANCELADA não conta. Venda parcial (linha nova com reserva_origem_id) não conta de novo: ela só divide uma
--     reserva que já estava contada.
--
-- Quando é conferido: ao CRIAR uma reserva, ao REATIVAR uma cancelada, ao AUMENTAR a quantidade e ao mudar o produto,
-- o processo ou o armazém. Mudar de ATIVA para VENDIDA, cancelar ou diminuir a quantidade não é barrado.
-- Se passar do saldo, a gravação inteira é recusada com a mensagem "Sem saldo disponível...".
--
-- Não mexe em nenhum dado existente. ORDEM: pode rodar antes ou depois do site (a tela já mostra a mensagem do banco).
-- Rode o script INTEIRO no SQL Editor do Supabase.

create or replace function sv_reservas_confere_saldo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev sv_previsoes%rowtype;
  v_achou boolean := false;
  v_pendente boolean := false;
  v_arm text;
  v_chave text;
  v_suprimento numeric;
  v_consumido numeric;
begin
  if new.situacao not in ('ATIVA', 'VENDIDA') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    -- linha da venda parcial: divide uma reserva que já estava contada
    if new.reserva_origem_id is not null then
      return null;
    end if;
  else
    -- não piorou o consumo: mesma medida e lote, já consumia e a quantidade não subiu
    if old.situacao in ('ATIVA', 'VENDIDA')
       and old.codigo = new.codigo
       and old.previsao_id is not distinct from new.previsao_id
       and coalesce(old.armazem, '') = coalesce(new.armazem, '')
       and new.quantidade <= old.quantidade then
      return null;
    end if;
  end if;

  -- em que lote essa reserva consome
  if new.previsao_id is not null then
    select * into v_prev from sv_previsoes where id = new.previsao_id;
    v_achou := found;
    if v_achou and v_prev.status <> 'FINALIZADO' then
      v_pendente := true;
    end if;
    v_arm := case when v_achou then coalesce(v_prev.armazem, '') else '' end;
  else
    v_arm := coalesce(new.armazem, '');
  end if;

  -- uma gravação de cada vez por lote: a segunda espera a primeira terminar e já enxerga o que a primeira gravou
  v_chave := case when v_pendente then 'prev|' || new.previsao_id || '|' || new.codigo
                  else 'est|' || new.codigo || '|' || v_arm end;
  perform pg_advisory_xact_lock(hashtext(v_chave));

  if v_pendente then
    select coalesce(sum(coalesce(nullif(e->>'quantidade', '')::numeric, 0)), 0) into v_suprimento
    from sv_previsoes p, jsonb_array_elements(p.itens) e
    where p.id = new.previsao_id and e->>'codigo' = new.codigo;

    select coalesce(sum(r.quantidade), 0) into v_consumido
    from sv_reservas r
    where r.previsao_id = new.previsao_id and r.codigo = new.codigo and r.situacao in ('ATIVA', 'VENDIDA');
  else
    select coalesce(sum(coalesce(nullif(e->>'quantidade', '')::numeric, 0)), 0) into v_suprimento
    from sv_previsoes p, jsonb_array_elements(p.itens) e
    where p.status = 'FINALIZADO' and coalesce(p.armazem, '') = v_arm and e->>'codigo' = new.codigo;

    select coalesce(sum(r.quantidade), 0) into v_consumido
    from sv_reservas r
    left join sv_previsoes pr on pr.id = r.previsao_id
    where r.codigo = new.codigo and r.situacao in ('ATIVA', 'VENDIDA')
      and ((r.previsao_id is null and coalesce(r.armazem, '') = v_arm)
        or (r.previsao_id is not null and pr.status = 'FINALIZADO' and coalesce(pr.armazem, '') = v_arm));
  end if;

  if v_consumido > v_suprimento then
    raise exception 'Sem saldo disponível de % %: há % un. livres e esta reserva pede %. Atualize a tela e confira o saldo.',
      new.codigo,
      case when v_pendente then 'neste processo' when v_arm = '' then 'sem armazém' else 'em ' || v_arm end,
      greatest(v_suprimento - (v_consumido - new.quantidade), 0),
      new.quantidade
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists sv_reservas_confere_saldo_trg on sv_reservas;
create trigger sv_reservas_confere_saldo_trg
  after insert or update on sv_reservas
  for each row execute function sv_reservas_confere_saldo();

notify pgrst, 'reload schema';

-- confere
select
  (select count(*) = 1 from pg_trigger where tgname = 'sv_reservas_confere_saldo_trg' and not tgisinternal) as gatilho,
  (select count(*) = 1 from pg_proc where proname = 'sv_reservas_confere_saldo') as funcao;
