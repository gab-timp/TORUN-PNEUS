-- CRM: DADOS FICTÍCIOS para ver as telas na prática (Atacado e Encomenda). NÃO rode em produção sem querer: leia antes.
--
-- O que cria (por sistema, só nos sistemas que têm executivo cadastrado):
--   * 24 cadastros com nome "TESTE · ... (Atacado)" / "TESTE · ... (Encomenda)": 2 representantes, 4 prospects e 18 clientes
--     (6 deles vêm via os representantes), todos na carteira dos executivos REAIS do sistema, repartidos em rodízio;
--   * contatos (1 a 2 por cliente e prospect), ligações dos últimos ~3 meses (de todos os resultados, com follow-ups atrasados,
--     de hoje e futuros), etapas do kanban (só Atacado) e o histórico de etapa;
--   * faturamento de 6 meses: 2 lançamentos por mês ("TESTE (dados fictícios)") com valores de ~65% dos clientes;
--   * % de comissão por executivo e mês, e metas anuais e mensais (SÓ onde ainda não existe meta nenhuma: metas reais ficam
--     intactas, e o que este script cria nelas é apagado na limpeza).
--
-- O que ISTO MISTURA com o que é real (avise a equipe enquanto os dados de teste existirem):
--   * os executivos reais vão ver clientes de teste nas carteiras deles;
--   * a tela Faturamento (e o relatório de comissão, o Dashboard e a lista de Clientes) vão somar os lançamentos de teste ao
--     que for real nos mesmos meses; o aviso de sobreposição de período pode aparecer para a Beth.
--
-- TUDO o que é criado fica anotado na tabela crm_dados_teste (nome da tabela e chave de cada linha), e o script
-- crm_dados_ficticios_apagar.sql apaga exatamente isso (e o que for criado em cima dos clientes de teste, como ligações novas).
--
-- Rode o script INTEIRO no SQL Editor do Supabase. Pré-requisitos: todos os SQLs do CRM já rodados (nucleo, clientes, prospects,
-- representantes, faturamento, metas, metas mensais, etapa_primeiro_contato). Não roda duas vezes seguidas: se já existem dados
-- de teste, para com um aviso (rode antes a limpeza).

create table if not exists crm_dados_teste (
  tabela text not null,
  chave text not null,
  criado_em timestamptz not null default now(),
  primary key (tabela, chave)
);
alter table crm_dados_teste enable row level security; -- sem política: ninguém lê pelo app

-- ---------------------------------------------------------------- clientes e carteira
do $$
declare
  s text;
  ids uuid[];
  nomes text[];
  n int;
  k int;
  nome text;
  tipo text;
  rep text;
  rep1 text;
  rep2 text;
  exec_i int;
  etapa text;
  id_cli text;
  cidades text[] := array['Curitiba', 'São Paulo', 'Campinas', 'Porto Alegre', 'Belo Horizonte', 'Goiânia', 'Recife', 'Fortaleza', 'Joinville', 'Londrina', 'Uberlândia', 'Cuiabá'];
  ufs text[] := array['PR', 'SP', 'SP', 'RS', 'MG', 'GO', 'PE', 'CE', 'SC', 'PR', 'MG', 'MT'];
  bases text[] := array['Transportes Alfa', 'Logística Beta', 'Frota Gama', 'Pneus Delta', 'Rodoviário Épsilon', 'Agro Zeta', 'Mineração Eta', 'Express Teta', 'Cargas Iota', 'Auto Kappa', 'Terra Lambda', 'Norte Sul Mu'];
  etapas text[] := array[null, 'Primeiro contato', 'Estimativa enviada', 'Em negociação', 'Fechamento', 'Fechado', 'Declinou'];
begin
  if exists (select 1 from crm_dados_teste) then
    raise exception 'Já existem dados de teste (tabela crm_dados_teste). Rode antes o script crm_dados_ficticios_apagar.sql.';
  end if;

  foreach s in array array['atacado', 'encomenda'] loop
    select array_agg(u.user_id order by coalesce(nullif(u.nome, ''), u.email)),
           array_agg(coalesce(nullif(u.nome, ''), u.email) order by coalesce(nullif(u.nome, ''), u.email))
      into ids, nomes
    from user_roles u
    where u.crm_papel = 'executivo'
      and s = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end));
    n := coalesce(array_length(ids, 1), 0);
    if n = 0 then
      raise notice 'Nenhum executivo cadastrado em %: este sistema ficou sem dados de teste.', s;
      continue;
    end if;
    rep1 := null;
    rep2 := null;

    for k in 1..24 loop
      nome := 'TESTE · ' || bases[((k - 1) % 12) + 1] || ' ' || lpad(k::text, 2, '0') || ' (' || initcap(s) || ')';
      tipo := case when k <= 2 then 'representante' when k <= 6 then 'prospect' else 'cliente' end;
      rep := case when k between 7 and 9 then rep1 when k between 10 and 12 then rep2 else null end;
      if k = 1 then rep1 := nome; end if;
      if k = 2 then rep2 := nome; end if;
      -- clientes via representante ficam com o executivo dele; os outros, em rodízio
      exec_i := ((case when k = 1 or k between 7 and 9 then 0 when k = 2 or k between 10 and 12 then 1 else k end) % n) + 1;
      id_cli := 'crmcli_teste_' || md5(nome);

      insert into crm_clientes (id, nome, tipo_pessoa, razao_social, contato, telefone, email, cidade, estado, origem, tipo, representante, origem_lead, observacao)
      values (id_cli, nome, 'PJ', nome, 'Contato ' || k, '(11) 9' || lpad((abs(hashtext(nome)) % 100000000)::text, 8, '0'),
              'contato' || k || '@teste.example', cidades[((k - 1) % 12) + 1], ufs[((k - 1) % 12) + 1], 'novo', tipo, rep,
              case when tipo = 'prospect' then 'Indicação' end, 'Cadastro fictício para teste');
      insert into crm_dados_teste (tabela, chave) values ('crm_clientes', id_cli);

      etapa := case when s = 'atacado' and tipo <> 'representante' then etapas[(k % 7) + 1] else null end;
      insert into crm_carteira (sistema, cliente, executivo_user_id, executivo_nome, etapa, etapa_desde, primeiro_followup, tambem_outro_sistema)
      values (s, nome, ids[exec_i], nomes[exec_i], etapa,
              case when etapa is not null then now() - ((k % 20) || ' days')::interval end,
              current_date + ((k % 9) - 4), false);
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------- contatos
insert into crm_contatos (sistema, cliente, nome, cargo, telefone, whatsapp, email, principal)
select c.sistema, c.cliente,
  (array['Marcos Teixeira', 'Helena Brandão', 'Fábio Ramos', 'Silvana Costa', 'Eduardo Lima', 'Ricardo Alves', 'Sérgio Moreira', 'Paula Nunes'])[abs(hashtext(c.cliente || g::text)) % 8 + 1],
  (array['Proprietário', 'Compras', 'Diretor', 'Gerente de frota', 'Financeiro'])[abs(hashtext(c.cliente || 'c' || g::text)) % 5 + 1],
  '(11) 9' || lpad((abs(hashtext(c.cliente || 't' || g::text)) % 100000000)::text, 8, '0'),
  null,
  'contato' || g || '@teste.example',
  g = 1
from crm_carteira c
join crm_clientes k on k.nome = c.cliente
cross join generate_series(1, 2) g
where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes')
  and k.tipo <> 'representante'
  and (g = 1 or abs(hashtext(c.cliente)) % 2 = 0);

-- ---------------------------------------------------------------- ligações (últimos ~3 meses)
insert into crm_ligacoes (sistema, cliente, contato_nome, resultado, observacao, proximo_followup, executivo_user_id, executivo_nome, created_at)
select c.sistema, c.cliente, 'Contato de teste', r.res, 'Ligação fictícia para teste',
  case when r.res in ('Pediu retorno', 'Interesse', 'Estimativa enviada')
       then d.dia::date + 3 + abs(hashtext(c.cliente || 'p' || g::text)) % 12 end,
  c.executivo_user_id, c.executivo_nome, least(d.dia, now())
from crm_carteira c
join crm_clientes k on k.nome = c.cliente
cross join generate_series(1, 6) g
cross join lateral (
  select date_trunc('day', now()) - (((g - 1) * 9 + abs(hashtext(c.cliente || 'd' || g::text)) % 8) * interval '1 day')
         + interval '9 hours' + (abs(hashtext(c.cliente || 'h' || g::text)) % 8) * interval '1 hour' as dia
) d
cross join lateral (
  select (array['Não atendeu', 'Pediu retorno', 'Interesse', 'Estimativa enviada', 'Fechou negócio', 'Sem interesse'])[abs(hashtext(c.cliente || 'r' || g::text)) % 6 + 1] as res
) r
where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes')
  and k.tipo <> 'representante'
  and g <= case when k.tipo = 'prospect' then 2 else 3 + abs(hashtext(c.cliente)) % 4 end;

-- histórico de etapa do kanban (só quem tem etapa, ou seja, o Atacado)
insert into crm_etapa_historico (sistema, cliente, de, para, origem, por_user_id, por_nome, quando)
select c.sistema, c.cliente, null, c.etapa, 'kanban', c.executivo_user_id, c.executivo_nome, c.etapa_desde
from crm_carteira c
join crm_clientes k on k.nome = c.cliente
where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes') and c.etapa is not null;

-- ---------------------------------------------------------------- faturamento: 2 lançamentos por mês, 6 meses
-- (sem tabela temporária: o SQL Editor do Supabase pode rodar cada comando em uma conexão diferente)
insert into crm_faturamento_lancamentos (id, sistema, periodo_de, periodo_ate, total, created_by_nome, created_at)
select md5('teste|' || x.sistema || '|' || x.de::text)::uuid, x.sistema, x.de, x.ate, 0, 'TESTE (dados fictícios)', (x.ate + time '17:00')::timestamptz
from (
  select s.sistema,
    case h.parte when 1 then m.mes_ini else m.mes_ini + 15 end as de,
    case h.parte when 1 then least(m.mes_ini + 14, current_date)
                 else least(((m.mes_ini + interval '1 month')::date) - 1, current_date) end as ate
  from (values ('atacado'), ('encomenda')) s(sistema)
  cross join (select (date_trunc('month', current_date) - (n * interval '1 month'))::date as mes_ini from generate_series(0, 5) n) m
  cross join (values (1), (2)) h(parte)
  where (case h.parte when 1 then m.mes_ini else m.mes_ini + 15 end) <= current_date
    and exists (
      select 1 from crm_carteira c join crm_clientes k on k.nome = c.cliente
      where c.sistema = s.sistema and k.tipo = 'cliente'
        and k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes')
    )
) x;

insert into crm_dados_teste (tabela, chave)
select 'crm_faturamento_lancamentos', id::text from crm_faturamento_lancamentos where created_by_nome = 'TESTE (dados fictícios)';

insert into crm_faturamento_itens (lancamento_id, sistema, cliente, executivo_user_id, executivo_nome, valor)
select l.id, l.sistema, c.cliente, c.executivo_user_id, c.executivo_nome,
  round((3000 + abs(hashtext(c.cliente || l.id::text)) % 60000)::numeric, 2)
from crm_faturamento_lancamentos l
join crm_carteira c on c.sistema = l.sistema
join crm_clientes k on k.nome = c.cliente
where l.created_by_nome = 'TESTE (dados fictícios)'
  and k.tipo = 'cliente'
  and k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes')
  and abs(hashtext(c.cliente || 'f' || l.id::text)) % 100 < 65;

update crm_faturamento_lancamentos l
set total = (select coalesce(sum(i.valor), 0) from crm_faturamento_itens i where i.lancamento_id = l.id)
where l.created_by_nome = 'TESTE (dados fictícios)';


-- ---------------------------------------------------------------- % de comissão (só onde não existe)
with exs as (
  select distinct c.executivo_user_id
  from crm_carteira c join crm_clientes k on k.nome = c.cliente
  where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes')
),
meses as (
  select (date_trunc('month', current_date) - (n * interval '1 month'))::date as mes from generate_series(0, 5) n
),
ins as (
  insert into crm_comissao_percentual (executivo_user_id, mes, percentual)
  select e.executivo_user_id, m.mes, (array[1.5, 1.8, 2.0, 2.5])[abs(hashtext(e.executivo_user_id::text)) % 4 + 1]
  from exs e cross join meses m
  on conflict do nothing
  returning executivo_user_id, mes
)
insert into crm_dados_teste (tabela, chave)
select 'crm_comissao_percentual', executivo_user_id::text || '|' || mes::text from ins;

-- ---------------------------------------------------------------- metas (só onde ainda não existe meta nenhuma)
do $$
declare
  v_ano int := extract(year from current_date)::int;
  v_mes date;
  m int;
begin
  create temp table _teste_execs on commit drop as
  select distinct c.executivo_user_id
  from crm_carteira c join crm_clientes k on k.nome = c.cliente
  where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes');

  if not exists (select 1 from crm_meta_equipe where ano = v_ano) then
    insert into crm_meta_equipe (ano, valor) values (v_ano, 0);
    insert into crm_meta_executivo (ano, executivo_user_id, valor)
    select v_ano, e.executivo_user_id, (3 + abs(hashtext(e.executivo_user_id::text)) % 4) * 1000000 from _teste_execs e;
    update crm_meta_equipe set valor = (select coalesce(sum(valor), 0) from crm_meta_executivo where ano = v_ano) where ano = v_ano;
    insert into crm_dados_teste (tabela, chave) values ('crm_meta_equipe', v_ano::text);
  end if;

  for m in 1..12 loop
    v_mes := make_date(v_ano, m, 1);
    if not exists (select 1 from crm_meta_mes_equipe where mes = v_mes) then
      insert into crm_meta_mes_equipe (mes, valor) values (v_mes, 0);
      insert into crm_meta_mes_executivo (mes, executivo_user_id, valor)
      select v_mes, e.executivo_user_id,
        round((((3 + abs(hashtext(e.executivo_user_id::text)) % 4) * 1000000 / 12.0) * (0.85 + (abs(hashtext(e.executivo_user_id::text || m::text)) % 4) * 0.1)) / 1000) * 1000
      from _teste_execs e;
      update crm_meta_mes_equipe set valor = (select coalesce(sum(valor), 0) from crm_meta_mes_executivo where mes = v_mes) where mes = v_mes;
      insert into crm_dados_teste (tabela, chave) values ('crm_meta_mes_equipe', v_mes::text);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- resumo do que foi criado
select tabela, count(*) as linhas_anotadas from crm_dados_teste group by tabela order by tabela;
