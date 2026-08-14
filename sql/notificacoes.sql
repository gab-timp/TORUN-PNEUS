-- Tabela central de notificações (sino no topbar) + 6 gatilhos que a alimentam:
-- 4 por evento (trigger normal) e 2 por tempo (pg_cron). "Lido/não lido" não é
-- por notificação -- é um único timestamp por usuário (ultima_notificacao_vista_em
-- em user_preferences): toda notificação criada DEPOIS desse timestamp conta como
-- não lida. Mais simples que uma tabela de junção, e resolve o caso de verdade
-- (usuário abre o sino, tudo que já existia vira "visto").
--
-- PASSO MANUAL antes de rodar a parte de agendamento (seções 7 e 8): habilitar a
-- extensão pg_cron no Supabase Dashboard -> Database -> Extensions -> buscar
-- "pg_cron" -> Enable. Sem isso, o "create extension" abaixo vai falhar.
--
-- Rode este SQL no SQL Editor do Supabase.

-- 1) Tabela.
create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  titulo text not null,
  descricao text,
  link_view text,
  link_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_notificacoes_created_at on notificacoes(created_at desc);

alter table notificacoes enable row level security;
-- Só escritório (não representante) lê -- representante já tem seu próprio aviso
-- de mudança de etapa em pedido-representante.js.
drop policy if exists "escritorio le notificacoes" on notificacoes;
create policy "escritorio le notificacoes" on notificacoes for select
  using (coalesce(current_user_role(), '') <> 'representante');
-- Sem policy de insert/update/delete pra "authenticated" -- só as funções abaixo
-- (security definer) escrevem aqui.

-- 2) Preferências: 4 colunas novas + o timestamp de "visto". notif_nova_proposta
-- e notif_mudanca_etapa já existiam (sql/user_preferences_tema_notif.sql) --
-- reaproveitados aqui também pro painel interno.
alter table user_preferences add column if not exists notif_estoque_baixo boolean not null default true;
alter table user_preferences add column if not exists notif_precadastro_novo boolean not null default true;
alter table user_preferences add column if not exists notif_pedido_parado boolean not null default true;
alter table user_preferences add column if not exists notif_previsto_chegando boolean not null default true;
alter table user_preferences add column if not exists ultima_notificacao_vista_em timestamptz;

-- 3) RPC: marcar tudo como visto (chamada toda vez que o sino é aberto).
create or replace function marcar_notificacoes_vistas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_preferences (user_id, ultima_notificacao_vista_em)
  values (auth.uid(), now())
  on conflict (user_id) do update set ultima_notificacao_vista_em = now();
end;
$$;
grant execute on function marcar_notificacoes_vistas() to authenticated;

-- 4) Estoque baixo: dispara em movimentos, recalcula o saldo do produto (mesma
-- soma que computeProdutoTotais() já faz no cliente) e notifica sempre que uma
-- movimentação daquela medida terminar com saldo abaixo do limite -- inclusive
-- se já estava baixo antes (decisão do usuário: repetir o aviso a cada
-- movimentação nova enquanto continuar baixo, não só na primeira vez que cruza).
create or replace function notificar_estoque_baixo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limite integer;
  saldo_atual numeric;
begin
  select coalesce(estoque_baixo_limite, 20) into limite from configuracoes_site limit 1;

  select coalesce(sum(case when tipo = 'entrada' then quantidade else -quantidade end), 0)
    into saldo_atual
    from movimentos where codigo = NEW.codigo;

  if saldo_atual < limite then
    insert into notificacoes (tipo, titulo, descricao, link_view, link_id)
    values ('estoque_baixo', 'Estoque baixo: ' || NEW.codigo, 'Saldo atual: ' || saldo_atual || ' un.', 'estoque', NEW.codigo);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notificar_estoque_baixo on movimentos;
create trigger trg_notificar_estoque_baixo
after insert on movimentos
for each row
execute function notificar_estoque_baixo();

-- 5) Proposta nova / proposta virou Entrada: dois eventos na mesma tabela
-- (entregas), trigger separada da de baixa de estoque (sincronizar_estoque_pedido)
-- de propósito -- responsabilidades diferentes, mesmo padrão de já ter duas
-- triggers independentes em entregas hoje.
create or replace function notificar_eventos_entregas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.origem = 'representante' and NEW.etapa = 'PRE_VENDA' then
      insert into notificacoes (tipo, titulo, descricao, link_view, link_id)
      values ('proposta_nova', 'Nova proposta de ' || coalesce(NEW.vendedor, 'representante'),
              coalesce(NEW.cliente, '—') || ' · Nº ' || coalesce(NEW.numero_pedido, '—'), 'entregas', NEW.id);
    end if;
    return NEW;
  end if;

  -- TG_OP = 'UPDATE' daqui pra baixo -- OLD só é referenciado aqui dentro.
  if NEW.origem = 'representante' and OLD.etapa = 'PRE_VENDA' and NEW.etapa = 'ENTRADA' then
    insert into notificacoes (tipo, titulo, descricao, link_view, link_id)
    values ('proposta_entrada', 'Proposta virou pedido: ' || coalesce(NEW.cliente, '—'),
            'Nº ' || coalesce(NEW.numero_pedido, '—') || ' avançou para Entrada', 'entregas', NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notificar_eventos_entregas on entregas;
create trigger trg_notificar_eventos_entregas
after insert or update on entregas
for each row
execute function notificar_eventos_entregas();

-- 6) Pré-cadastro novo.
create or replace function notificar_precadastro_novo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'pendente' then
    insert into notificacoes (tipo, titulo, descricao, link_view, link_id)
    values ('precadastro_novo', 'Novo pré-cadastro: ' || coalesce(NEW.nome, '—'),
            'Enviado por ' || coalesce(NEW.enviado_por, '—'), 'clientes', NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notificar_precadastro_novo on clientes_pendentes;
create trigger trg_notificar_precadastro_novo
after insert on clientes_pendentes
for each row
execute function notificar_precadastro_novo();

-- 7) Pedido parado >24h (exceto Rastreio/Finalizados/cancelado) -- via pg_cron,
-- roda de hora em hora. Só notifica de novo se o pedido ficou parado DE NOVO
-- depois da última vez que avisamos (compara updated_at com o created_at da
-- notificação anterior) -- não fica repetindo a cada hora parado na mesma vez.
create extension if not exists pg_cron;

create or replace function verificar_pedidos_parados()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notificacoes (tipo, titulo, descricao, link_view, link_id)
  select 'pedido_parado', 'Pedido parado há mais de 24h: ' || coalesce(e.cliente, '—'),
         'Nº ' || coalesce(e.numero_pedido, '—') || ' · etapa: ' || e.etapa, 'entregas', e.id
  from entregas e
  where e.updated_at < now() - interval '24 hours'
    and e.etapa not in ('RASTREIO', 'FINALIZADOS')
    and coalesce(e.cancelado, false) = false
    and not exists (
      select 1 from notificacoes n
      where n.tipo = 'pedido_parado' and n.link_id = e.id and n.created_at > e.updated_at
    );
end;
$$;

select cron.schedule('verificar-pedidos-parados', '0 * * * *', 'select verificar_pedidos_parados();');

-- 8) Previsto chegando em até 5 dias -- roda 1x por dia, de manhã. "DTC" é o
-- status final (já chegou/desembaraçado) -- exclui pra não notificar sobre
-- previsto que já foi resolvido.
create or replace function verificar_previstos_chegando()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notificacoes (tipo, titulo, descricao, link_view, link_id)
  select 'previsto_chegando', 'Previsto chegando em breve — processo ' || coalesce(p.numero_processo, '—'),
         'Chegada prevista: ' || to_char(p.data_chegada, 'DD/MM/YYYY'), 'previsto', p.id
  from previsoes p
  where p.data_chegada is not null
    and p.data_chegada between current_date and current_date + interval '5 days'
    and coalesce(p.status, '') <> 'DTC'
    and not exists (
      select 1 from notificacoes n where n.tipo = 'previsto_chegando' and n.link_id = p.id
    );
end;
$$;

select cron.schedule('verificar-previstos-chegando', '0 8 * * *', 'select verificar_previstos_chegando();');

-- Confira depois de rodar:
select jobname, schedule from cron.job where jobname like 'verificar-%';
