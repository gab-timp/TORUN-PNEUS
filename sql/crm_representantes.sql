-- CRM Atacado e Encomenda: REPRESENTANTES (agrupador de clientes).
--
-- O representante externo é cadastrado no CRM como um cliente de tipo novo ('representante'), ao lado de 'cliente' e
-- 'prospect'. Ele NÃO recebe ligação nem follow-up e não entra em Hoje nem no kanban: serve para agrupar os clientes
-- que vêm por ele. Esses clientes são clientes normais da carteira (com ligação, follow-up e etapa) e só ganham um
-- vínculo opcional "atendido via representante X" (crm_clientes.representante, um nome de representante).
--
--   - 'representante' nunca muda de tipo (nem outro cadastro vira representante depois de criado);
--   - só um representante pode ser apontado em crm_clientes.representante; um representante não aponta para outro;
--   - excluir o representante solta os clientes dele (representante vira vazio), não apaga ninguém;
--   - renomear o representante acompanha nos clientes (on update cascade).
-- O executivo dos clientes de um representante é o mesmo do representante: essa regra fica na tela (o banco não
-- impede trocar o executivo depois pela carteira).
--
-- ORDEM: rode ANTES de publicar a versão nova do site (crm.js v20 / crm-perfil.js v6). Sem este SQL o site novo continua
-- como antes e esconde a opção Representante (ele percebe que a coluna "representante" não existe). Pode rodar de
-- novo sem estragar. Pré-requisito: crm_prospects.sql já rodado (coluna tipo).
--
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

alter table crm_clientes add column if not exists representante text
  references crm_clientes(nome) on update cascade on delete set null;

create index if not exists crm_clientes_representante_idx on crm_clientes (representante);

alter table crm_clientes drop constraint if exists crm_clientes_tipo_check;
alter table crm_clientes add constraint crm_clientes_tipo_check check (tipo in ('prospect', 'cliente', 'representante'));

-- guarda do tipo: o que já existia (cliente efetivo não volta a ser prospect; prospect vira cliente) + representante fixo
create or replace function crm_clientes_tipo_guarda() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.tipo = 'cliente' and new.tipo = 'prospect' then
      raise exception 'Cliente efetivo não volta a ser prospect.';
    end if;
    if (old.tipo = 'representante') <> (new.tipo = 'representante') then
      raise exception 'Representante não muda de tipo.';
    end if;
    if old.tipo = 'prospect' and new.tipo = 'cliente' then
      new.convertido_em := now();
      new.convertido_por := auth.uid();
    end if;
  end if;
  return new;
end $$;

-- vínculo com o representante: só aponta para um representante, nunca para si mesmo, e um representante não tem representante
create or replace function crm_clientes_representante_guarda() returns trigger
language plpgsql as $$
begin
  if new.representante is not null then
    if new.representante = new.nome then
      raise exception 'Um cadastro não pode ser representante de si mesmo.';
    end if;
    if new.tipo = 'representante' then
      raise exception 'Representante não tem representante.';
    end if;
    if not exists (select 1 from crm_clientes r where r.nome = new.representante and r.tipo = 'representante') then
      raise exception 'O cadastro escolhido não é um representante.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_clientes_representante_guarda on crm_clientes;
create trigger crm_clientes_representante_guarda before insert or update on crm_clientes
  for each row execute function crm_clientes_representante_guarda();

-- conferência (esperado: coluna 1, constraint 1, 2 gatilhos; nenhum representante ainda)
select
  (select count(*) from information_schema.columns where table_name = 'crm_clientes' and column_name = 'representante') as coluna,
  (select count(*) from pg_constraint where conname = 'crm_clientes_tipo_check' and pg_get_constraintdef(oid) ilike '%representante%') as constraint_tipo,
  (select count(*) from pg_trigger where tgrelid = 'crm_clientes'::regclass and tgname in ('crm_clientes_tipo_guarda', 'crm_clientes_representante_guarda')) as gatilhos,
  (select count(*) from crm_clientes where tipo = 'representante') as representantes;
