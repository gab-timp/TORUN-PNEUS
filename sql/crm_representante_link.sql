-- CRM: LINK do representante. Na ficha do representante a gestão (ou o executivo dono dele) gera um link; quem abre o link
-- vê só o painel daquele representante (faturamento e comissão), sem usuário nem senha.
--
-- Como é guardado: o código secreto do link só aparece na hora de gerar. No banco fica apenas uma versão embaralhada
-- (sha256), então nem quem lê o banco consegue refazer o link. Gerar um novo link troca o código (o antigo para de
-- funcionar na hora); desativar apaga o acesso até gerarem outro. O código vai no endereço depois do "#", que o navegador
-- não manda para o servidor.
--
-- Novidades:
--   crm_representante_links                    um registro por representante (hash, quem gerou, quando, último acesso)
--   crm_gerar_link_representante(rep)          gera/troca o código e devolve o código novo (gestão ou executivo dono)
--   crm_desativar_link_representante(rep)      desliga o link
--   crm_link_representante_status(rep)         se há link ativo, quando foi gerado, por quem e o último acesso
--   crm_painel_representante_link(codigo, mes) o painel do representante para quem abre o link (liberada ao anônimo)
--   crm_painel_representante_dados(...)        o miolo do painel, agora compartilhado pelo login e pelo link (sem acesso externo)
--
-- ORDEM: rode ANTES de publicar o site. Pré-requisito: crm_representante_painel.sql. Pode rodar de novo.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- tabela dos links
create table if not exists crm_representante_links (
  representante text primary key references crm_clientes(nome) on update cascade on delete cascade,
  codigo_hash text not null,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);
alter table crm_representante_links enable row level security;
-- sem nenhuma política: ninguém lê nem grava a tabela direto; tudo passa pelas funções abaixo

-- ---------------------------------------------------------------- miolo do painel (compartilhado)
create or replace function crm_painel_representante_dados(p_rep text, p_sis text, p_mes date, p_nome text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', coalesce(p_mes, current_date))::date;
  v_ini date;
  v_fim date;
  v_clientes jsonb;
  v_lanc jsonb;
  v_serie jsonb;
  v_pct numeric;
  v_lancada boolean;
  v_ano numeric;
begin
  v_ini := v_mes;
  v_fim := (v_mes + interval '1 month' - interval '1 day')::date;

  select coalesce(jsonb_agg(jsonb_build_object('cliente', k.nome, 'faturado', coalesce(f.total, 0), 'comissao', coalesce(c.valor, 0)) order by coalesce(f.total, 0) desc, k.nome), '[]'::jsonb)
  into v_clientes
  from crm_clientes k
  left join (
    select i.cliente, sum(i.valor) as total
    from crm_faturamento_itens i join crm_faturamento_lancamentos l on l.id = i.lancamento_id
    where l.sistema = p_sis and l.periodo_de between v_ini and v_fim
    group by i.cliente
  ) f on f.cliente = k.nome
  left join crm_representante_comissao c on c.sistema = p_sis and c.representante = p_rep and c.mes = v_mes and c.cliente = k.nome
  where k.representante = p_rep
    and (f.total is not null or c.valor is not null or exists (select 1 from crm_carteira w where w.cliente = k.nome and w.sistema = p_sis));

  select coalesce(jsonb_agg(jsonb_build_object('cliente', i.cliente, 'de', l.periodo_de, 'ate', l.periodo_ate, 'valor', i.valor) order by l.periodo_de desc, i.cliente), '[]'::jsonb)
  into v_lanc
  from crm_faturamento_itens i
  join crm_faturamento_lancamentos l on l.id = i.lancamento_id
  join crm_clientes k on k.nome = i.cliente and k.representante = p_rep
  where l.sistema = p_sis and l.periodo_de between v_ini and v_fim;

  select coalesce(jsonb_agg(jsonb_build_object('mes', m.mes, 'faturado', coalesce(f.total, 0), 'comissao', coalesce(c.total, 0)) order by m.mes), '[]'::jsonb)
  into v_serie
  from (select (v_mes - make_interval(months => n))::date as mes from generate_series(0, 5) n) m
  left join (
    select date_trunc('month', l.periodo_de)::date as mes, sum(i.valor) as total
    from crm_faturamento_itens i
    join crm_faturamento_lancamentos l on l.id = i.lancamento_id
    join crm_clientes k on k.nome = i.cliente and k.representante = p_rep
    where l.sistema = p_sis
    group by 1
  ) f on f.mes = m.mes
  left join (
    select mes, sum(valor) as total from crm_representante_comissao where sistema = p_sis and representante = p_rep group by mes
  ) c on c.mes = m.mes;

  select p.percentual into v_pct from crm_representante_percentual p
  where p.sistema = p_sis and p.representante = p_rep and p.mes <= v_mes order by p.mes desc limit 1;
  select exists (select 1 from crm_representante_comissao c where c.sistema = p_sis and c.representante = p_rep and c.mes = v_mes) into v_lancada;
  select coalesce(sum(c.valor), 0) into v_ano from crm_representante_comissao c
  where c.sistema = p_sis and c.representante = p_rep and c.mes >= date_trunc('year', v_mes)::date and c.mes <= v_mes;

  return jsonb_build_object(
    'representante', p_rep, 'sistema', p_sis, 'nome', coalesce(p_nome, p_rep), 'mes', v_mes,
    'percentual', v_pct, 'lancada', v_lancada, 'comissao_ano', v_ano,
    'clientes', v_clientes, 'lancamentos', v_lanc, 'serie', v_serie
  );
end;
$$;
-- só as outras funções (que rodam como dono) chamam este miolo
revoke all on function crm_painel_representante_dados(text, text, date, text) from public;

-- o painel do login do representante, agora em cima do miolo
create or replace function crm_painel_representante(p_mes date, p_representante text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rep text;
  v_sis text;
  v_nome text;
begin
  select u.crm_representante, u.crm_sistema into v_rep, v_sis from user_roles u where u.user_id = auth.uid();
  if v_rep is null then
    if current_user_crm_papel() in ('financeiro', 'gestao') then
      v_rep := p_representante;
      v_sis := null;
    else
      raise exception 'Sem acesso ao painel do representante.' using errcode = '42501';
    end if;
  end if;
  if v_rep is null or not exists (select 1 from crm_clientes where nome = v_rep and tipo = 'representante') then
    raise exception 'Representante não encontrado.';
  end if;
  if v_sis is null then
    select c.sistema into v_sis from crm_carteira c where c.cliente = v_rep order by c.sistema limit 1;
  end if;
  if v_sis is null then
    raise exception 'Este representante não está na carteira de nenhum sistema.';
  end if;
  select coalesce(nullif(u.nome, ''), v_rep) into v_nome from user_roles u where u.user_id = auth.uid();
  return crm_painel_representante_dados(v_rep, v_sis, p_mes, v_nome);
end;
$$;
revoke all on function crm_painel_representante(date, text) from public;
grant execute on function crm_painel_representante(date, text) to authenticated;

-- ---------------------------------------------------------------- quem pode mexer no link
create or replace function crm_pode_gerir_link_representante(p_rep text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select crm_pode_escrever() and (
    current_user_crm_papel() = 'gestao'
    or (current_user_crm_papel() = 'executivo'
        and exists (select 1 from crm_carteira c where c.cliente = p_rep and c.executivo_user_id = auth.uid()))
  )
  and exists (select 1 from crm_clientes k where k.nome = p_rep and k.tipo = 'representante');
$$;
revoke all on function crm_pode_gerir_link_representante(text) from public;
grant execute on function crm_pode_gerir_link_representante(text) to authenticated;

-- gera (ou troca) o código do link e devolve o código novo: é a única vez que ele aparece
create or replace function crm_gerar_link_representante(p_representante text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_nome text;
begin
  if not crm_pode_gerir_link_representante(p_representante) then
    raise exception 'Só a gestão ou o executivo dono do representante gera o link.' using errcode = '42501';
  end if;
  v_codigo := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  select coalesce(nullif(u.nome, ''), u.email) into v_nome from user_roles u where u.user_id = auth.uid();
  insert into crm_representante_links (representante, codigo_hash, ativo, criado_por, criado_por_nome, criado_em, ultimo_acesso)
  values (p_representante, encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex'), true, auth.uid(), v_nome, now(), null)
  on conflict (representante) do update
    set codigo_hash = excluded.codigo_hash, ativo = true, criado_por = excluded.criado_por,
        criado_por_nome = excluded.criado_por_nome, criado_em = now(), ultimo_acesso = null;
  return v_codigo;
end;
$$;
revoke all on function crm_gerar_link_representante(text) from public;
grant execute on function crm_gerar_link_representante(text) to authenticated;

create or replace function crm_desativar_link_representante(p_representante text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not crm_pode_gerir_link_representante(p_representante) then
    raise exception 'Só a gestão ou o executivo dono do representante desativa o link.' using errcode = '42501';
  end if;
  update crm_representante_links set ativo = false where representante = p_representante;
end;
$$;
revoke all on function crm_desativar_link_representante(text) from public;
grant execute on function crm_desativar_link_representante(text) to authenticated;

create or replace function crm_link_representante_status(p_representante text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r crm_representante_links%rowtype;
begin
  if not crm_pode_gerir_link_representante(p_representante) then
    raise exception 'Sem acesso ao link deste representante.' using errcode = '42501';
  end if;
  select * into r from crm_representante_links where representante = p_representante;
  if not found or not r.ativo then
    return jsonb_build_object('ativo', false);
  end if;
  return jsonb_build_object('ativo', true, 'criado_em', r.criado_em, 'criado_por', r.criado_por_nome, 'ultimo_acesso', r.ultimo_acesso);
end;
$$;
revoke all on function crm_link_representante_status(text) from public;
grant execute on function crm_link_representante_status(text) to authenticated;

-- ---------------------------------------------------------------- quem abre o link (sem login)
-- Devolve null quando o código não vale (trocado, desativado ou errado): a página mostra "este link não vale mais".
create or replace function crm_painel_representante_link(p_codigo text, p_mes date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep text;
  v_sis text;
begin
  if p_codigo is null or length(p_codigo) < 32 then return null; end if;
  select l.representante into v_rep
  from crm_representante_links l
  where l.ativo and l.codigo_hash = encode(sha256(convert_to(p_codigo, 'UTF8')), 'hex');
  if v_rep is null then return null; end if;
  select c.sistema into v_sis from crm_carteira c where c.cliente = v_rep order by c.sistema limit 1;
  if v_sis is null then return null; end if;
  update crm_representante_links set ultimo_acesso = now() where representante = v_rep;
  return crm_painel_representante_dados(v_rep, v_sis, p_mes, v_rep);
end;
$$;
revoke all on function crm_painel_representante_link(text, date) from public;
grant execute on function crm_painel_representante_link(text, date) to anon, authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from information_schema.tables where table_name = 'crm_representante_links') as tabela,
  (select count(*) = 7 from pg_proc where proname in ('crm_painel_representante_dados', 'crm_painel_representante', 'crm_pode_gerir_link_representante', 'crm_gerar_link_representante', 'crm_desativar_link_representante', 'crm_link_representante_status', 'crm_painel_representante_link')) as funcoes,
  (select count(*) = 0 from pg_policies where tablename = 'crm_representante_links') as tabela_fechada,
  has_function_privilege('anon', 'crm_painel_representante_link(text, date)', 'execute') as anonimo_abre_link,
  not has_function_privilege('anon', 'crm_painel_representante_dados(text, text, date, text)', 'execute') as miolo_fechado;
