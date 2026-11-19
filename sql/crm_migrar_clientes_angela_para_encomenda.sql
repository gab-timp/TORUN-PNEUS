-- CRM: MIGRAR os 6 clientes da ANGELA do Atacado para a Encomenda (saem do Atacado; nada é apagado nem duplicado).
--
--   Automotiva Pneus Comercio, Imp. E Exp. Ltda · COO ATACAnSTA DE PNEUS LTDA · Dale Importadora E Distribuidora De Pneus Ltda
--   ORNELAS COMERCIO E IMPORTACAO LTDA · RPS PNEUS E SERVICOS LTDA · Schwab Comercio De Pneus Ltda
--   (os nomes estão EXATAMENTE como no cadastro, inclusive o "COO ATACAnSTA", que é assim no banco)
--
-- Prévia conferida: os 6 estão na carteira do Atacado e também na da Encomenda (cópia criada por "também compra no outro
-- sistema"), ambos com a Angela, e NÃO têm ligação, cartão no kanban, faturamento nem histórico de etapa, em nenhum dos dois.
-- Os contatos são os mesmos nos dois (3, 2, 4, 2, 3 e 4).
--
-- Como migra: apaga a cópia VAZIA da Encomenda e troca o sistema da carteira do Atacado para 'encomenda'. Ligações,
-- contatos, cartões e histórico (se houvesse) vão junto por cascata, com o que já foi registrado.
--
-- TRAVAS (o script inteiro é uma transação só: se qualquer uma falhar, NADA é alterado):
--   * tem que achar exatamente os 6 clientes na carteira do Atacado, com a Angela como executiva;
--   * a cópia da Encomenda só é apagada se estiver VAZIA (0 ligações, 0 histórico, 0 faturamento, nenhum cartão com
--     cotação ou observação); senão o script para;
--   * nenhum deles pode ter faturamento lançado no Atacado (mover o item mudaria o total do lançamento e a comissão);
--   * a Angela precisa atender a Encomenda (senão os clientes sumiriam da tela dela).
--
-- Rode o script INTEIRO no SQL Editor. Não precisa publicar nada no site: é só dado.

do $$
declare
  v_nomes text[] := array[
    'Automotiva Pneus Comercio, Imp. E Exp. Ltda', 'COO ATACAnSTA DE PNEUS LTDA',
    'Dale Importadora E Distribuidora De Pneus Ltda', 'ORNELAS COMERCIO E IMPORTACAO LTDA',
    'RPS PNEUS E SERVICOS LTDA', 'Schwab Comercio De Pneus Ltda'];
  v_achou int;
  v_fat int;
  v_angela uuid;
  v_ok boolean;
begin
  select count(*) into v_achou from crm_carteira
   where sistema = 'atacado' and cliente = any(v_nomes) and executivo_nome ilike '%ngela%';
  if v_achou <> 6 then
    raise exception 'Esperava os 6 clientes na carteira do Atacado com a Angela, mas achei %. Nada foi alterado: confira a prévia.', v_achou;
  end if;

  if exists (select 1 from crm_ligacoes where sistema = 'encomenda' and cliente = any(v_nomes))
     or exists (select 1 from crm_etapa_historico where sistema = 'encomenda' and cliente = any(v_nomes))
     or exists (select 1 from crm_faturamento_itens where sistema = 'encomenda' and cliente = any(v_nomes))
     or exists (select 1 from crm_negociacoes where sistema = 'encomenda' and cliente = any(v_nomes)
                and (cot_enviadas > 0 or nullif(btrim(coalesce(obs, '')), '') is not null)) then
    raise exception 'A cópia na Encomenda de algum desses clientes já tem registro (ligação, etapa, faturamento ou cartão preenchido). Nada foi alterado: me avise.';
  end if;

  select count(*) into v_fat from crm_faturamento_itens where sistema = 'atacado' and cliente = any(v_nomes);
  if v_fat > 0 then
    raise exception 'Estes clientes têm % lançamento(s) de faturamento no Atacado. Nada foi alterado: me avise para ajustar o faturamento junto.', v_fat;
  end if;

  select distinct executivo_user_id into v_angela from crm_carteira
   where sistema = 'atacado' and cliente = any(v_nomes);
  select exists (
    select 1 from user_roles u
    where u.user_id = v_angela
      and 'encomenda' = any(coalesce(u.crm_sistemas, case when u.crm_sistema is not null then array[u.crm_sistema] else array[]::text[] end))
  ) or exists (
    select 1 from user_roles u where u.user_id = v_angela and coalesce(u.crm_papel, case when u.is_admin then 'gestao' end) = 'gestao'
  ) into v_ok;
  if not v_ok then
    raise exception 'A Angela não atende a Encomenda. Libere o acesso dela antes de migrar (senão os clientes somem da tela dela). Nada foi alterado.';
  end if;

  -- 1) apaga a cópia vazia da Encomenda (os contatos e cartões vazios dela; os do Atacado é que valem)
  delete from crm_carteira where sistema = 'encomenda' and cliente = any(v_nomes);

  -- 2) move a carteira do Atacado para a Encomenda (ligações, contatos, cartões e histórico vão junto, por cascata)
  update crm_carteira
     set sistema = 'encomenda', tambem_outro_sistema = false
   where sistema = 'atacado' and cliente = any(v_nomes) and executivo_nome ilike '%ngela%';
end $$;

-- Confere (rode sozinho depois): os 6 aparecem só em 'encomenda', com os contatos de antes (3, 2, 4, 2, 3 e 4).
select c.sistema, c.cliente, c.executivo_nome,
       (select count(*) from crm_ligacoes x where x.sistema = c.sistema and x.cliente = c.cliente) as ligacoes,
       (select count(*) from crm_contatos x where x.sistema = c.sistema and x.cliente = c.cliente) as contatos,
       (select count(*) from crm_negociacoes x where x.sistema = c.sistema and x.cliente = c.cliente) as contatos_kanban
from crm_carteira c
where c.cliente in ('Automotiva Pneus Comercio, Imp. E Exp. Ltda','COO ATACAnSTA DE PNEUS LTDA','Dale Importadora E Distribuidora De Pneus Ltda',
                    'ORNELAS COMERCIO E IMPORTACAO LTDA','RPS PNEUS E SERVICOS LTDA','Schwab Comercio De Pneus Ltda')
order by c.sistema, c.cliente;
