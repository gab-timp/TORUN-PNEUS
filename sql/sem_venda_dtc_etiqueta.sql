-- SEM VENDA: o DTC do Estoque Previsto deixa de ser um STATUS (coluna) e vira uma ETIQUETA do processo,
-- igual ao Torun (sql/previsoes_dtc_etiqueta.sql).
--
--   1. Coluna nova sv_previsoes.dtc (true/false, começa false). A etiqueta vale em qualquer coluna.
--   2. Os processos do Sem Venda que estão com status 'DTC' passam para 'AGUARDANDO RETIRADA DO PORTO' e já
--      ficam com a etiqueta marcada (dtc = true). Sem essa troca o card sumiria do quadro, porque a coluna
--      DTC deixa de existir.
--
-- O estoque do Sem Venda só entra com status FINALIZADO, então esta mudança NÃO mexe em saldo, reserva ou
-- venda. O único gatilho da tabela é o de updated_at.
--
-- RODE ESTE SQL ANTES de publicar o site novo: o Sem Venda passa a gravar a coluna `dtc` em todo processo novo
-- ou editado, e sem a coluna esse salvamento quebra.

alter table sv_previsoes add column if not exists dtc boolean not null default false;

update sv_previsoes
set dtc = true, status = 'AGUARDANDO RETIRADA DO PORTO'
where status = 'DTC';

-- Confere: não deve sobrar nenhum processo com status DTC, e os que estavam nele aparecem com dtc = true.
select status, dtc, count(*) as processos
from sv_previsoes
group by status, dtc
order by status, dtc;
