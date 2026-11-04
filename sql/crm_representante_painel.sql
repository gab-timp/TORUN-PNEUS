-- CRM Atacado e Encomenda: PAINEL DO REPRESENTANTE (faturamento e comissão dele) e comissão lançada pela Beth.
--
-- Como funciona:
--   1) A Beth (papel financeiro), na tela Faturamento, lança a comissão de cada representante no mês: um % e o valor
--      de cada cliente que vem por ele (o valor nasce do %, mas cada linha pode ser ajustada à mão).
--   2) O representante entra com o próprio login e vê só o painel dele: faturamento e comissão do mês, por cliente,
--      mês a mês e os lançamentos. Nada mais do CRM.
--
-- O login do representante NÃO tem papel no CRM (crm_papel continua vazio), então as políticas das tabelas do CRM
-- continuam fechando tudo para ele. Ele só lê pela função crm_painel_representante, que devolve apenas o que é dele.
--
-- Novidades:
--   user_roles.crm_representante            qual representante (cadastro tipo 'representante') este login é
--   crm_representante_percentual            % de comissão do representante, por sistema e mês
--   crm_representante_comissao              comissão de cada cliente do representante no mês (valor em R$)
--   crm_salvar_comissao_representante(...)  grava a comissão do mês (só o financeiro)
--   crm_painel_representante(mes, nome)     tudo que o painel mostra (o representante vê o dele; financeiro e gestão
--                                           podem pedir o de qualquer representante)
--
-- ORDEM: rode ANTES de publicar o site. Pré-requisitos: crm_faturamento.sql e crm_representantes.sql já rodados.
-- Pode rodar de novo. Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

-- ---------------------------------------------------------------- login do representante
alter table user_roles add column if not exists crm_representante text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_roles_crm_representante_fk') then
    alter table user_roles add constraint user_roles_crm_representante_fk
      foreign key (crm_representante) references crm_clientes(nome) on update cascade on delete set null;
  end if;
  -- quem é representante não tem papel no CRM (assim as políticas do CRM continuam fechadas para ele)
  if not exists (select 1 from pg_constraint where conname = 'user_roles_crm_representante_sem_papel') then
    alter table user_roles add constraint user_roles_crm_representante_sem_papel
      check (crm_representante is null or crm_papel is null);
  end if;
end $$;

-- ---------------------------------------------------------------- tabelas
create table if not exists crm_representante_percentual (
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  representante text not null references crm_clientes(nome) on update cascade on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  percentual numeric(5,2) not null check (percentual >= 0 and percentual <= 100),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (sistema, representante, mes)
);

create table if not exists crm_representante_comissao (
  sistema text not null check (sistema in ('atacado', 'encomenda')),
  representante text not null references crm_clientes(nome) on update cascade on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  cliente text not null references crm_clientes(nome) on update cascade on delete cascade,
  valor numeric(14,2) not null check (valor >= 0),
  ajustado boolean not null default false,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (sistema, representante, mes, cliente)
);

alter table crm_representante_percentual enable row level security;
alter table crm_representante_comissao enable row level security;

drop policy if exists crm_rep_pct_select on crm_representante_percentual;
create policy crm_rep_pct_select on crm_representante_percentual for select to authenticated
  using (current_user_crm_papel() in ('financeiro', 'gestao'));
drop policy if exists crm_rep_com_select on crm_representante_comissao;
create policy crm_rep_com_select on crm_representante_comissao for select to authenticated
  using (current_user_crm_papel() in ('financeiro', 'gestao'));
-- sem política de insert/update/delete: a escrita só passa pela função abaixo

-- ---------------------------------------------------------------- a Beth lança a comissão do representante
-- p_itens: [{ "cliente": "Nome", "valor": 1560.00, "ajustado": false }, ...]  (um por cliente do representante)
create or replace function crm_salvar_comissao_representante(p_sistema text, p_representante text, p_mes date, p_percentual numeric, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x jsonb;
  v_cli text;
  v_valor numeric;
begin
  if current_user_crm_papel() is distinct from 'financeiro' or not crm_pode_escrever() then
    raise exception 'Só o financeiro lança a comissão do representante.' using errcode = '42501';
  end if;
  if p_sistema is null or p_sistema not in ('atacado', 'encomenda') then
    raise exception 'Sistema inválido.';
  end if;
  if p_mes is null or extract(day from p_mes) <> 1 then
    raise exception 'Mês inválido.';
  end if;
  if not exists (select 1 from crm_clientes where nome = p_representante and tipo = 'representante') then
    raise exception '"%" não é um representante cadastrado.', p_representante;
  end if;
  if p_percentual is null or p_percentual < 0 or p_percentual > 100 then
    raise exception 'O percentual de comissão tem que ficar entre 0 e 100.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Informe a comissão dos clientes do representante.';
  end if;

  insert into crm_representante_percentual (sistema, representante, mes, percentual, atualizado_por, atualizado_em)
  values (p_sistema, p_representante, p_mes, round(p_percentual, 2), auth.uid(), now())
  on conflict (sistema, representante, mes) do update
    set percentual = excluded.percentual, atualizado_por = auth.uid(), atualizado_em = now();

  -- o mês salvo substitui o anterior (clientes que saíram da lista deixam de ter comissão)
  delete from crm_representante_comissao where sistema = p_sistema and representante = p_representante and mes = p_mes;

  for x in select value from jsonb_array_elements(p_itens) loop
    v_cli := x->>'cliente';
    v_valor := (x->>'valor')::numeric;
    if v_cli is null or v_valor is null or v_valor < 0 then
      raise exception 'Cada cliente precisa de uma comissão de zero em diante.';
    end if;
    if not exists (select 1 from crm_clientes where nome = v_cli and representante = p_representante) then
      raise exception 'O cliente "%" não vem pelo representante "%".', v_cli, p_representante;
    end if;
    insert into crm_representante_comissao (sistema, representante, mes, cliente, valor, ajustado, atualizado_por, atualizado_em)
    values (p_sistema, p_representante, p_mes, v_cli, round(v_valor, 2), coalesce((x->>'ajustado')::boolean, false), auth.uid(), now());
  end loop;
end;
$$;

revoke all on function crm_salvar_comissao_representante(text, text, date, numeric, jsonb) from public;
grant execute on function crm_salvar_comissao_representante(text, text, date, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------- o painel do representante
-- O representante (login com user_roles.crm_representante) recebe SÓ o dele; financeiro e gestão (e administrador, que conta
-- como gestão) podem pedir o de um representante pelo nome, para conferir o que ele está vendo.
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
  v_mes date := date_trunc('month', coalesce(p_mes, current_date))::date;
  v_ini date;
  v_fim date;
  v_clientes jsonb;
  v_lanc jsonb;
  v_serie jsonb;
  v_pct numeric;
  v_lancada boolean;
  v_ano numeric;
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
  -- o sistema do painel: o do login; para financeiro e gestão, o sistema em que o representante está na carteira
  if v_sis is null then
    select c.sistema into v_sis from crm_carteira c where c.cliente = v_rep order by c.sistema limit 1;
  end if;
  if v_sis is null then
    raise exception 'Este representante não está na carteira de nenhum sistema.';
  end if;

  v_ini := v_mes;
  v_fim := (v_mes + interval '1 month' - interval '1 day')::date;

  -- clientes que vêm por ele, com o faturado do mês e a comissão lançada
  select coalesce(jsonb_agg(jsonb_build_object('cliente', k.nome, 'faturado', coalesce(f.total, 0), 'comissao', coalesce(c.valor, 0)) order by coalesce(f.total, 0) desc, k.nome), '[]'::jsonb)
  into v_clientes
  from crm_clientes k
  left join (
    select i.cliente, sum(i.valor) as total
    from crm_faturamento_itens i join crm_faturamento_lancamentos l on l.id = i.lancamento_id
    where l.sistema = v_sis and l.periodo_de between v_ini and v_fim
    group by i.cliente
  ) f on f.cliente = k.nome
  left join crm_representante_comissao c on c.sistema = v_sis and c.representante = v_rep and c.mes = v_mes and c.cliente = k.nome
  where k.representante = v_rep
    and (f.total is not null or c.valor is not null or exists (select 1 from crm_carteira w where w.cliente = k.nome and w.sistema = v_sis));

  -- lançamentos do mês dos clientes dele
  select coalesce(jsonb_agg(jsonb_build_object('cliente', i.cliente, 'de', l.periodo_de, 'ate', l.periodo_ate, 'valor', i.valor) order by l.periodo_de desc, i.cliente), '[]'::jsonb)
  into v_lanc
  from crm_faturamento_itens i
  join crm_faturamento_lancamentos l on l.id = i.lancamento_id
  join crm_clientes k on k.nome = i.cliente and k.representante = v_rep
  where l.sistema = v_sis and l.periodo_de between v_ini and v_fim;

  -- últimos 6 meses (até o mês pedido): faturamento e comissão
  select coalesce(jsonb_agg(jsonb_build_object('mes', m.mes, 'faturado', coalesce(f.total, 0), 'comissao', coalesce(c.total, 0)) order by m.mes), '[]'::jsonb)
  into v_serie
  from (select (v_mes - make_interval(months => n))::date as mes from generate_series(0, 5) n) m
  left join (
    select date_trunc('month', l.periodo_de)::date as mes, sum(i.valor) as total
    from crm_faturamento_itens i
    join crm_faturamento_lancamentos l on l.id = i.lancamento_id
    join crm_clientes k on k.nome = i.cliente and k.representante = v_rep
    where l.sistema = v_sis
    group by 1
  ) f on f.mes = m.mes
  left join (
    select mes, sum(valor) as total from crm_representante_comissao where sistema = v_sis and representante = v_rep group by mes
  ) c on c.mes = m.mes;

  select p.percentual into v_pct from crm_representante_percentual p
  where p.sistema = v_sis and p.representante = v_rep and p.mes <= v_mes order by p.mes desc limit 1;
  select exists (select 1 from crm_representante_comissao c where c.sistema = v_sis and c.representante = v_rep and c.mes = v_mes) into v_lancada;
  select coalesce(sum(c.valor), 0) into v_ano from crm_representante_comissao c
  where c.sistema = v_sis and c.representante = v_rep and c.mes >= date_trunc('year', v_mes)::date and c.mes <= v_mes;
  select coalesce(nullif(u.nome, ''), v_rep) into v_nome from user_roles u where u.user_id = auth.uid();

  return jsonb_build_object(
    'representante', v_rep, 'sistema', v_sis, 'nome', v_nome, 'mes', v_mes,
    'percentual', v_pct, 'lancada', v_lancada, 'comissao_ano', v_ano,
    'clientes', v_clientes, 'lancamentos', v_lanc, 'serie', v_serie
  );
end;
$$;

revoke all on function crm_painel_representante(date, text) from public;
grant execute on function crm_painel_representante(date, text) to authenticated;

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from information_schema.columns where table_name = 'user_roles' and column_name = 'crm_representante') as coluna_login,
  (select count(*) = 2 from information_schema.tables where table_name in ('crm_representante_percentual', 'crm_representante_comissao')) as tabelas,
  (select count(*) = 2 from pg_proc where proname in ('crm_salvar_comissao_representante', 'crm_painel_representante')) as funcoes,
  (select count(*) = 2 from pg_policies where tablename in ('crm_representante_percentual', 'crm_representante_comissao')) as politicas,
  (select count(*) = 0 from pg_policies where tablename in ('crm_representante_percentual', 'crm_representante_comissao') and cmd <> 'SELECT') as sem_escrita_direta;
