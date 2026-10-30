-- CRM: APAGA os dados fictícios criados por crm_dados_ficticios_encher.sql, e só eles.
--
-- Tudo o que o script de encher criou está anotado em crm_dados_teste. Aqui se apaga, nesta ordem:
--   * os itens de faturamento dos clientes de teste e os lançamentos fictícios (e qualquer lançamento que ficou vazio por causa
--     disso; o total dos que sobram é recalculado);
--   * ligações, histórico de etapa, contatos, mudanças registradas e carteira dos clientes de teste, em qualquer sistema
--     (inclui o que você fez em cima deles testando: ligações novas, "levar para o outro sistema", renomear etc.);
--   * os cadastros de teste, achados pelo ID guardado (então vale mesmo que você tenha renomeado algum);
--   * os % de comissão e as metas que o script criou. Metas e % que já existiam NÃO são tocados.
-- No fim apaga a própria tabela crm_dados_teste. Não mexe em nada que não esteja no registro.
--
-- Cadastros de teste que você criou à mão (sem o registro) e lançamentos reais que a Beth tenha feito para clientes de teste
-- não são identificados: os itens deles saem junto com o cliente de teste, e o total do lançamento é recalculado.
--
-- Rode o script INTEIRO no SQL Editor do Supabase.

delete from crm_faturamento_itens where cliente in (select k.nome from crm_clientes k where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes'));
delete from crm_faturamento_lancamentos where id::text in (select chave from crm_dados_teste where tabela = 'crm_faturamento_lancamentos');
-- lançamento válido nunca é vazio: o que ficou sem itens só tinha clientes de teste
delete from crm_faturamento_lancamentos l where not exists (select 1 from crm_faturamento_itens i where i.lancamento_id = l.id);
update crm_faturamento_lancamentos l
set total = (select coalesce(sum(i.valor), 0) from crm_faturamento_itens i where i.lancamento_id = l.id)
where l.total is distinct from (select coalesce(sum(i.valor), 0) from crm_faturamento_itens i where i.lancamento_id = l.id);

delete from crm_ligacoes where cliente in (select k.nome from crm_clientes k where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes'));
delete from crm_etapa_historico where cliente in (select k.nome from crm_clientes k where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes'));
delete from crm_contatos where cliente in (select k.nome from crm_clientes k where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes'));
delete from crm_cliente_mudancas where cliente in (select k.nome from crm_clientes k where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes'));
delete from crm_carteira where cliente in (select k.nome from crm_clientes k where k.id in (select chave from crm_dados_teste where tabela = 'crm_clientes'));
delete from crm_clientes where id in (select chave from crm_dados_teste where tabela = 'crm_clientes');

delete from crm_comissao_percentual
where (executivo_user_id::text || '|' || mes::text) in (select chave from crm_dados_teste where tabela = 'crm_comissao_percentual');
delete from crm_meta_mes_equipe where mes::text in (select chave from crm_dados_teste where tabela = 'crm_meta_mes_equipe');
delete from crm_meta_equipe where ano::text in (select chave from crm_dados_teste where tabela = 'crm_meta_equipe');

drop table crm_dados_teste;

-- confere: tudo 0
select
  (select count(*) from crm_clientes where nome like 'TESTE · %') as clientes_de_teste,
  (select count(*) from crm_carteira where cliente like 'TESTE · %') as carteira_de_teste,
  (select count(*) from crm_faturamento_lancamentos where created_by_nome = 'TESTE (dados fictícios)') as lancamentos_de_teste;
