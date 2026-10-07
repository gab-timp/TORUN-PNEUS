-- A etapa "Financeiro" do Kanban de Entregas foi dividida em 4 etapas novas:
-- Autorização de Gerência, Análise de Crédito, Aguardando Pagamento, Validação de Transporte.
--
-- Pedidos que já estejam na etapa antiga "FINANCEIRO" não têm mais uma coluna própria no quadro
-- (senão ficariam "escondidos"). Isso move todos eles pra primeira das novas etapas
-- (Autorização de Gerência), que é a que fica na mesma posição de antes, logo após Entrada.
-- Se algum precisar ir pra uma etapa mais específica, é só arrastar o card depois.

update entregas set etapa = 'AUTORIZACAO_GERENCIA' where etapa = 'FINANCEIRO';

-- Confira quantos pedidos foram movidos:
select count(*) as pedidos_movidos from entregas where etapa = 'AUTORIZACAO_GERENCIA';
