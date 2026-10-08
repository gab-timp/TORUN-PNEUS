-- Sem Venda: o status "CHEGOU" do Estoque Previsto passa a se chamar "FINALIZADO" (igual ao do Torun).
--
-- O estoque do Sem Venda é calculado a partir dos processos com esse status (o que "chegou" entra no
-- estoque). O código novo (semvenda.js v=10) procura FINALIZADO; este SQL troca o valor dos processos
-- que já estão como CHEGOU em sv_previsoes. Não há restrição de valores no banco, é só um texto.
--
-- ORDEM: rode junto com a publicação da branch sem-venda. Os dois lados precisam combinar:
--   * SQL rodado e código antigo no ar  -> o estoque do Sem Venda fica zerado (ninguém é "CHEGOU" mais);
--   * código novo no ar e SQL sem rodar -> idem (o código procura FINALIZADO e os processos ainda são CHEGOU).
-- Nenhum dado se perde nos dois casos: voltar o SQL (FINALIZADO -> CHEGOU) ou rodar o que faltou
-- restaura o estoque. Como o Sem Venda ainda é só da equipe de teste, o intervalo não aparece pra ninguém.
--
-- Só mexe em sv_previsoes. O SQL do Torun é outro (sql/previsoes_status_finalizado.sql).

update sv_previsoes
set status = 'FINALIZADO'
where status = 'CHEGOU';

-- Confere: não deve sobrar nenhuma linha com CHEGOU
select status, count(*) as processos
from sv_previsoes
group by status
order by status;
