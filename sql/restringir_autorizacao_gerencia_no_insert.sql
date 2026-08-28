-- Achado numa revisão de código (agente dedicado a Entregas/Kanban): a trava de
-- "só quem tem pode_autorizar_gerencia consegue pular Autorização de Gerência"
-- (restringir_pular_autorizacao_gerencia.sql) só existia como `before update`.
-- Isso nunca cobria CRIAR um pedido novo já direto numa etapa depois de
-- Autorização de Gerência (ex: escolher "Faturamento" no seletor de Etapa do
-- formulário de Novo Pedido) -- o client (site/app.js) também não bloqueava
-- isso no caminho de inserção, só no de edição. Ou seja: qualquer editor comum
-- (não só quem tem a permissão especial) podia criar um pedido que pula a
-- revisão do gerente inteira e já dispara a baixa automática de estoque
-- (sql/baixa_automatica_e_cancelamento_pedidos.sql) na hora.
--
-- Este script substitui a função pra também cobrir TG_OP = 'INSERT' (onde OLD
-- não existe) e troca o trigger pra rodar em insert e update. Continua
-- liberado criar em qualquer etapa até "Autorização de Gerência" (inclusive
-- nela mesma -- só significa que nasce já esperando revisão); só bloqueia
-- nascer numa etapa DEPOIS dela sem ter a permissão.
--
-- Rode este SQL no SQL Editor do Supabase (substitui a função e o trigger
-- anteriores -- idempotente, pode rodar de novo sem problema).

create or replace function bloquear_saida_autorizacao_gerencia()
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
  idx_old int;
  idx_new int := array_position(ordem, NEW.etapa);
  precisa_autorizacao boolean;
  usuario_autorizado boolean;
begin
  if TG_OP = 'INSERT' then
    -- Pedido nascendo já numa etapa depois de Autorização de Gerência é
    -- equivalente a "pular a etapa inteira" -- mesma regra de quando um
    -- pedido existente pula direto de antes pra depois dela.
    precisa_autorizacao := idx_new is not null and idx_new > idx_ag;
  else
    idx_old := array_position(ordem, OLD.etapa);
    if NEW.etapa is distinct from OLD.etapa then
      precisa_autorizacao := (OLD.etapa = 'AUTORIZACAO_GERENCIA')
        or (idx_old is not null and idx_new is not null and idx_old < idx_ag and idx_new > idx_ag);
    else
      precisa_autorizacao := false;
    end if;
  end if;

  if precisa_autorizacao then
    select coalesce(is_admin or pode_autorizar_gerencia, false) into usuario_autorizado
    from user_roles where user_id = auth.uid();

    if not coalesce(usuario_autorizado, false) then
      raise exception 'Somente um usuário autorizado pode criar ou mover um pedido para depois de Autorização de Gerência.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_bloquear_saida_autorizacao_gerencia on entregas;
create trigger trg_bloquear_saida_autorizacao_gerencia
before insert or update on entregas
for each row
execute function bloquear_saida_autorizacao_gerencia();
