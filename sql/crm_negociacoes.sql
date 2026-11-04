-- CRM: LIGAÇÕES EM KANBAN, com vários cartões (contatos) por cliente, cotações e observação do cartão.
--
-- Até aqui o kanban guardava UMA etapa por cliente (crm_carteira.etapa). Agora cada "contato" com o cliente é um
-- cartão próprio (uma negociação): quando um contato termina (Fechado ou Declinou) ele vai para os Arquivados e o
-- cliente pode começar outro contato depois, com histórico e cotações separados.
--
--   crm_negociacoes    -> um cartão: etapa, observação do cartão, cotações enviadas/aprovadas, quando terminou.
--   crm_ligacoes       -> ganha negociacao_id (a que contato a ligação pertence) e cotacoes_enviadas (quantas
--                         cotações foram enviadas NAQUELA ligação). Um gatilho soma isso no cartão.
--   crm_etapa_historico-> ganha negociacao_id.
--
-- O que já existe vira o 1º contato de cada cliente: uma negociação por linha da carteira, com a etapa que o cliente
-- tinha (Fechado e Declinou entram já arquivados), e as ligações antigas ficam ligadas a ela. crm_carteira.etapa
-- continua na tabela, mas o site novo não a usa mais.
--
-- Quem lê e quem grava: igual à carteira. Lê quem enxerga o cliente na carteira; grava o executivo dono da carteira
-- e a gestão; só a gestão apaga.
--
-- ORDEM: rode ANTES de publicar o site novo (crm.js v39 / crm-ligacoes.js v1). Pré-requisito: crm_nucleo (e
-- crm_etapa_primeiro_contato). Pode rodar de novo sem estragar nada. Rode o script INTEIRO no SQL Editor do Supabase
-- (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- tabela
create table if not exists crm_negociacoes (
  id uuid primary key default gen_random_uuid(),
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  cliente text not null,
  numero integer not null default 1 check (numero >= 1),
  etapa text check (etapa is null or etapa in ('Primeiro contato', 'Estimativa enviada', 'Em negociação', 'Fechamento', 'Fechado', 'Declinou')),
  etapa_desde timestamptz,
  obs text,
  cot_enviadas integer not null default 0 check (cot_enviadas >= 0),
  cot_aprovadas integer not null default 0 check (cot_aprovadas >= 0),
  -- preenchido quando o contato termina (etapa Fechado ou Declinou); vazio = contato aberto
  finalizada_em timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (sistema, cliente) references crm_carteira (sistema, cliente) on update cascade on delete cascade,
  unique (sistema, cliente, numero),
  constraint crm_negociacoes_aprovadas_check check (cot_aprovadas <= cot_enviadas)
);
create index if not exists idx_crm_negociacoes_cliente on crm_negociacoes (sistema, cliente, numero desc);

-- no máximo UM contato aberto por cliente em cada sistema
create unique index if not exists crm_negociacoes_uma_aberta
  on crm_negociacoes (sistema, cliente) where finalizada_em is null;

alter table crm_negociacoes enable row level security;

drop policy if exists crm_negociacoes_select on crm_negociacoes;
create policy crm_negociacoes_select on crm_negociacoes for select to authenticated
  using (exists (select 1 from crm_carteira c where c.sistema = crm_negociacoes.sistema and c.cliente = crm_negociacoes.cliente));

drop policy if exists crm_negociacoes_insert on crm_negociacoes;
create policy crm_negociacoes_insert on crm_negociacoes for insert to authenticated
  with check (
    crm_pode_escrever() and (
      current_user_crm_papel() = 'gestao'
      or (current_user_crm_papel() = 'executivo' and exists (
        select 1 from crm_carteira c
        where c.sistema = crm_negociacoes.sistema and c.cliente = crm_negociacoes.cliente and c.executivo_user_id = auth.uid()))
    )
  );

drop policy if exists crm_negociacoes_update on crm_negociacoes;
create policy crm_negociacoes_update on crm_negociacoes for update to authenticated
  using (
    crm_pode_escrever() and (
      current_user_crm_papel() = 'gestao'
      or (current_user_crm_papel() = 'executivo' and exists (
        select 1 from crm_carteira c
        where c.sistema = crm_negociacoes.sistema and c.cliente = crm_negociacoes.cliente and c.executivo_user_id = auth.uid()))
    )
  )
  with check (
    current_user_crm_papel() = 'gestao'
    or (current_user_crm_papel() = 'executivo' and exists (
      select 1 from crm_carteira c
      where c.sistema = crm_negociacoes.sistema and c.cliente = crm_negociacoes.cliente and c.executivo_user_id = auth.uid()))
  );

drop policy if exists crm_negociacoes_delete on crm_negociacoes;
create policy crm_negociacoes_delete on crm_negociacoes for delete to authenticated
  using (crm_pode_escrever() and current_user_crm_papel() = 'gestao');

-- ---------------------------------------------------------------- ligações e histórico apontam para o contato
alter table crm_ligacoes add column if not exists negociacao_id uuid references crm_negociacoes(id) on delete set null;
alter table crm_ligacoes add column if not exists cotacoes_enviadas integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_ligacoes_cotacoes_check') then
    alter table crm_ligacoes add constraint crm_ligacoes_cotacoes_check check (cotacoes_enviadas >= 0);
  end if;
end $$;
create index if not exists idx_crm_ligacoes_negociacao on crm_ligacoes (negociacao_id);

alter table crm_etapa_historico add column if not exists negociacao_id uuid references crm_negociacoes(id) on delete set null;

-- ---------------------------------------------------------------- soma das cotações enviadas no cartão
-- Cada ligação nova com cotações enviadas soma no cartão a que pertence (security definer: vale mesmo que o RLS
-- do cartão barre quem registra a ligação).
create or replace function crm_ligacao_soma_cotacoes() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.negociacao_id is not null and coalesce(new.cotacoes_enviadas, 0) > 0 then
    update crm_negociacoes set cot_enviadas = cot_enviadas + new.cotacoes_enviadas where id = new.negociacao_id;
  end if;
  return new;
end $$;

drop trigger if exists crm_ligacao_soma_cotacoes on crm_ligacoes;
create trigger crm_ligacao_soma_cotacoes after insert on crm_ligacoes
  for each row execute function crm_ligacao_soma_cotacoes();

-- ---------------------------------------------------------------- o que já existe vira o 1º contato de cada cliente
-- (só cria para quem ainda não tem nenhum contato; rodar de novo não duplica)
insert into crm_negociacoes (sistema, cliente, numero, etapa, etapa_desde, finalizada_em)
select c.sistema, c.cliente, 1, c.etapa, c.etapa_desde,
       case when c.etapa in ('Fechado', 'Declinou') then coalesce(c.etapa_desde, now()) end
from crm_carteira c
where not exists (select 1 from crm_negociacoes n where n.sistema = c.sistema and n.cliente = c.cliente);

update crm_ligacoes l set negociacao_id = n.id
from crm_negociacoes n
where l.negociacao_id is null and n.sistema = l.sistema and n.cliente = l.cliente and n.numero = 1;

update crm_etapa_historico h set negociacao_id = n.id
from crm_negociacoes n
where h.negociacao_id is null and n.sistema = h.sistema and n.cliente = h.cliente and n.numero = 1;

-- ---------------------------------------------------------------- confere (rode sozinho; ok = true em todas as linhas)
select item, ok from (values
  ('4 políticas em crm_negociacoes', (select count(*) = 4 from pg_policies where tablename = 'crm_negociacoes')),
  ('toda linha da carteira tem pelo menos 1 contato', (select count(*) = 0 from crm_carteira c where not exists (select 1 from crm_negociacoes n where n.sistema = c.sistema and n.cliente = c.cliente))),
  ('ligações sem contato ligado (deve ser 0)', (select count(*) = 0 from crm_ligacoes where negociacao_id is null)),
  ('gatilho das cotações criado', (select count(*) = 1 from pg_trigger where tgname = 'crm_ligacao_soma_cotacoes')),
  ('colunas novas em crm_ligacoes', (select count(*) = 2 from information_schema.columns where table_name = 'crm_ligacoes' and column_name in ('negociacao_id', 'cotacoes_enviadas')))
) as t(item, ok);
