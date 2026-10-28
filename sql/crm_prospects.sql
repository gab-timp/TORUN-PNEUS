-- CRM Atacado e Encomenda: PROSPECT x CLIENTE EFETIVO no cadastro.
--
-- O cadastro próprio do CRM (crm_clientes) passa a ter um tipo:
--   'cliente'  -> cliente efetivo (todos os que já existem ficam assim, sem mudar nada);
--   'prospect' -> ainda não comprou: cadastro curto (contato, origem, o que compra), sem perfil fiscal.
-- O prospect vira cliente efetivo pela ficha ("Tornar cliente efetivo"). Cliente efetivo NÃO volta a ser prospect.
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm.js v9 / crm-perfil.js v4). O site novo, sem este SQL,
-- continua funcionando como antes e esconde a escolha de prospect (ele percebe que a coluna "tipo" não existe).
-- Pode rodar de novo sem estragar.
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

alter table crm_clientes add column if not exists tipo text not null default 'cliente';
alter table crm_clientes add column if not exists origem_lead text;
alter table crm_clientes add column if not exists interesse_tipos text[];
alter table crm_clientes add column if not exists observacao text;
alter table crm_clientes add column if not exists convertido_em timestamptz;
alter table crm_clientes add column if not exists convertido_por uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_clientes_tipo_check') then
    alter table crm_clientes add constraint crm_clientes_tipo_check check (tipo in ('prospect', 'cliente'));
  end if;
end $$;

-- cliente efetivo não volta a ser prospect; ao virar cliente, grava quando e quem converteu
create or replace function crm_clientes_tipo_guarda() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.tipo = 'cliente' and new.tipo = 'prospect' then
      raise exception 'Cliente efetivo não volta a ser prospect.';
    end if;
    if old.tipo = 'prospect' and new.tipo = 'cliente' then
      new.convertido_em := now();
      new.convertido_por := auth.uid();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_clientes_tipo_guarda on crm_clientes;
create trigger crm_clientes_tipo_guarda before update on crm_clientes
  for each row execute function crm_clientes_tipo_guarda();

-- conferência (esperado: todos os cadastros atuais como cliente, nenhum prospect ainda)
select count(*) filter (where tipo = 'cliente') as clientes,
       count(*) filter (where tipo = 'prospect') as prospects
from crm_clientes;
