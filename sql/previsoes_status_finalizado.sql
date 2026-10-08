-- Estoque Previsto (Torun): o status "CHEGOU" passa a se chamar "FINALIZADO".
--
-- O status é um texto em previsoes.status (não há restrição no banco), então basta trocar o valor dos
-- processos que já estão como CHEGOU. Rode no SQL Editor do Supabase junto com o site novo: com o site
-- novo no ar e este SQL ainda sem rodar, os processos antigos "Chegou" ficam fora de todas as colunas
-- do kanban (nenhum dado se perde, mas eles não aparecem até a troca).
--
-- Só mexe na tabela previsoes (Torun). O Sem Venda tem tabela própria (sv_previsoes) e o SQL dele é
-- outro (sql/sem_venda_status_finalizado.sql, na branch sem-venda).

update previsoes
set status = 'FINALIZADO'
where status = 'CHEGOU';

-- Confere: não deve sobrar nenhuma linha com CHEGOU, e os finalizados aparecem na contagem
select status, count(*) as processos
from previsoes
group by status
order by status;
