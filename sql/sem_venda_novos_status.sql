-- SEM VENDA: novas colunas do Estoque Previsto.
--
--   Sai:    ATRACADO (nenhum processo estava nele)
--   Troca:  AGUARDANDO RETIRADA DO PORTO  ->  NACIONALIZADO, AG RETIRADA DO PORTO
--   Entram: PRESENCIADO (depois de AGUARDANDO PRESENÇA) e FATURADO (depois de FINALIZADO)
--
-- Estoque: o pneu entra no estoque do Sem Venda em FINALIZADO e continua valendo em FATURADO.
-- Só o Sem Venda muda; o Estoque Previsto do Torun (tabela previsoes) fica como está.
--
-- Os status são texto livre no banco (sem CHECK), então só o UPDATE abaixo é necessário.
-- RODE ESTE SQL JUNTO com a publicação do site novo (semvenda.js v=53): enquanto o SQL não rodar, o card que
-- estava em AGUARDANDO RETIRADA DO PORTO não aparece em nenhuma coluna do quadro novo (nenhum dado se perde,
-- é só trocar o texto).
--
-- ATENÇÃO: a trava de saldo no banco (sql/sem_venda_trava_saldo_reservas.sql), SE já estiver instalada, só
-- reconhece 'FINALIZADO' como chegado. Antes de aceitar processos em FATURADO, confira com
-- pg_get_functiondef a função viva e inclua 'FATURADO' nela (a trava ainda estava pendente de instalação).

update sv_previsoes
set status = 'NACIONALIZADO, AG RETIRADA DO PORTO'
where status = 'AGUARDANDO RETIRADA DO PORTO';

-- Confere: não deve sobrar processo em ATRACADO nem em AGUARDANDO RETIRADA DO PORTO.
select status, count(*) as processos
from sv_previsoes
group by status
order by status;
