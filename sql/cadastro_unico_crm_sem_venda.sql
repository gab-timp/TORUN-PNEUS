-- Cadastro ÚNICO de clientes: o CRM cadastra, o Sem Venda só lista.
--
--   * crm_clientes passa a ser o cadastro dos dois sistemas (ganha a coluna obs, que o Sem Venda usava).
--   * Os clientes de sv_clientes são copiados para crm_clientes. Se o cliente já existe no CRM (mesmo nome, ou mesmo
--     CNPJ/CPF), VALE O DO CRM e o do Sem Venda só preenche o que estiver vazio.
--   * sv_reservas.cliente passa a apontar para crm_clientes(nome) (renomear no CRM atualiza as reservas; cliente com
--     reserva não pode ser apagado). Reserva de cliente que casou com outro nome do CRM passa a usar o nome do CRM.
--   * sv_clientes_do_crm(): função que o Sem Venda usa para listar. Só devolve cliente efetivo (não prospect nem
--     representante), com todos os dados e a unidade de negócio calculada pela carteira do CRM (Atacado, Encomenda
--     ou Ambos; sem carteira, usa a unidade que o Sem Venda já tinha, ou Ambos). Não abre carteira, ligação nem perfil.
--   * A tabela sv_clientes NÃO é apagada: fica de cópia de segurança (o site novo não a usa mais).
--
-- NADA é apagado aqui. A limpeza dos clientes do Torun é outro arquivo (cadastro_unico_limpeza_torun_PREVIA.sql),
-- só de consulta.
--
-- ORDEM: rode ANTES de publicar o site novo (semvenda.js v26 / crm-perfil.js v8). Pré-requisitos: crm_clientes,
-- crm_prospects (coluna tipo), sem_venda_clientes. Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase
-- (ele mostra só o resultado da última consulta).

alter table crm_clientes add column if not exists obs text;

-- ---------------------------------------------------------------- 1) copia sv_clientes para crm_clientes
-- mapa: nome no Sem Venda -> nome no CRM (casa por nome sem maiúscula/espaço extra, ou por CNPJ/CPF com 11+ dígitos)
drop table if exists _sv_mapa;
create temporary table _sv_mapa as
select s.id as sv_id, s.nome as sv_nome,
       (select k.nome from crm_clientes k
         where lower(btrim(k.nome)) = lower(btrim(s.nome))
            or (length(regexp_replace(coalesce(s.documento, ''), '\D', '', 'g')) >= 11
                and regexp_replace(coalesce(k.documento, ''), '\D', '', 'g') = regexp_replace(s.documento, '\D', '', 'g'))
         order by (lower(btrim(k.nome)) = lower(btrim(s.nome))) desc, k.nome
         limit 1) as crm_nome
from sv_clientes s;

-- 1a) quem já existe no CRM: só preenche o que está vazio
update crm_clientes k set
  tipo_pessoa = coalesce(k.tipo_pessoa, s.tipo_pessoa),
  documento = coalesce(nullif(btrim(k.documento), ''), nullif(btrim(s.documento), '')),
  contato = coalesce(nullif(btrim(k.contato), ''), nullif(btrim(s.contato), '')),
  telefone = coalesce(nullif(btrim(k.telefone), ''), nullif(btrim(s.telefone), '')),
  email = coalesce(nullif(btrim(k.email), ''), nullif(btrim(s.email), '')),
  cidade = coalesce(nullif(btrim(k.cidade), ''), nullif(btrim(s.cidade), '')),
  estado = coalesce(nullif(btrim(k.estado), ''), nullif(btrim(s.estado), '')),
  obs = coalesce(nullif(btrim(k.obs), ''), nullif(btrim(s.obs), ''))
from _sv_mapa m
join sv_clientes s on s.id = m.sv_id
where m.crm_nome is not null and k.nome = m.crm_nome;

-- 1b) quem não existe no CRM: entra como cliente efetivo
insert into crm_clientes (id, nome, tipo_pessoa, documento, contato, telefone, email, cidade, estado, obs, origem, tipo, created_by)
select 'crmcli_' || replace(gen_random_uuid()::text, '-', ''), s.nome, s.tipo_pessoa, nullif(btrim(s.documento), ''),
       nullif(btrim(s.contato), ''), nullif(btrim(s.telefone), ''), nullif(btrim(s.email), ''),
       nullif(btrim(s.cidade), ''), nullif(btrim(s.estado), ''), nullif(btrim(s.obs), ''), 'novo', 'cliente', s.created_by
from _sv_mapa m
join sv_clientes s on s.id = m.sv_id
where m.crm_nome is null
on conflict do nothing;

-- ---------------------------------------------------------------- 2) reservas passam a apontar para o CRM
alter table sv_reservas drop constraint if exists sv_reservas_cliente_sv_fkey;
alter table sv_reservas drop constraint if exists sv_reservas_cliente_crm_fkey;

-- reserva de cliente que casou com outro nome do CRM passa a usar o nome do CRM
update sv_reservas r set cliente = m.crm_nome
from _sv_mapa m
where r.cliente = m.sv_nome and m.crm_nome is not null and m.crm_nome <> m.sv_nome;

alter table sv_reservas add constraint sv_reservas_cliente_crm_fkey
  foreign key (cliente) references crm_clientes(nome) on update cascade on delete restrict;

-- ---------------------------------------------------------------- 3) leitura do Sem Venda
create or replace function sv_clientes_do_crm()
returns table (
  id text, nome text, tipo_pessoa text, documento text, razao_social text, contato text, telefone text, email text,
  cep text, endereco text, cidade text, estado text, obs text, unidade_negocio text, sistema_crm text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (current_user_pode_acessar_sem_venda() or current_user_crm_papel() is not null) then
    return;
  end if;
  return query
  select k.id, k.nome, k.tipo_pessoa, k.documento, k.razao_social, k.contato, k.telefone, k.email,
         k.cep, k.endereco, k.cidade, k.estado, k.obs,
         case
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado')
            and exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'AMBOS'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado') then 'ATACADO'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'ENCOMENDA'
           else coalesce((select s.unidade_negocio from sv_clientes s where lower(btrim(s.nome)) = lower(btrim(k.nome)) limit 1), 'AMBOS')
         end,
         case
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado')
            and exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'Atacado e Encomenda'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'atacado') then 'Atacado'
           when exists (select 1 from crm_carteira c where c.cliente = k.nome and c.sistema = 'encomenda') then 'Encomenda'
           else null
         end,
         k.created_at
  from crm_clientes k
  where k.tipo = 'cliente'
  order by k.nome;
end $$;
grant execute on function sv_clientes_do_crm() to authenticated;

-- ---------------------------------------------------------------- confere (rode sozinho; ok = true em todas as linhas)
select item, ok from (values
  ('reservas sem cliente no cadastro do CRM (deve ser 0)', (select count(*) = 0 from sv_reservas r where not exists (select 1 from crm_clientes k where k.nome = r.cliente))),
  ('chave das reservas aponta para crm_clientes', (select count(*) = 1 from pg_constraint where conname = 'sv_reservas_cliente_crm_fkey')),
  ('função de leitura criada', (select count(*) = 1 from pg_proc where proname = 'sv_clientes_do_crm')),
  ('coluna obs em crm_clientes', (select count(*) = 1 from information_schema.columns where table_name = 'crm_clientes' and column_name = 'obs'))
) as t(item, ok);
