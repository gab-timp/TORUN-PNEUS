-- Sem Venda: o custo passa do cadastro do produto para o processo do Estoque Previsto.
--
-- O custo agora e o TOTAL do processo (opcional, pode ser preenchido ou corrigido depois, quando o custo fechar).
-- O "valor investido" do Dashboard e da Armazenagem soma o custo total dos processos que ja chegaram (FINALIZADO).
--
-- Coluna nova (opcional, nada existente muda):
--   sv_previsoes.custo_total   custo total do processo, em reais
--
-- A coluna sv_produtos.custo_unitario continua no banco, sem uso (a tela nao le nem grava mais).
--
-- Rode este SQL ANTES de publicar o site: a tela passa a ler e gravar custo_total; sem a coluna, salvar um
-- processo falha. Rode o script INTEIRO no SQL Editor do Supabase (ele mostra so o resultado da ultima consulta).

alter table sv_previsoes add column if not exists custo_total numeric(14,2);
alter table sv_previsoes drop constraint if exists sv_previsoes_custo_total_check;
alter table sv_previsoes add constraint sv_previsoes_custo_total_check check (custo_total is null or custo_total >= 0);

-- ---------------------------------------------------------------- confere
select
  (select count(*) = 1 from information_schema.columns where table_name = 'sv_previsoes' and column_name = 'custo_total') as coluna,
  (select count(*) = 1 from pg_constraint where conname = 'sv_previsoes_custo_total_check') as constraint_ok,
  (select count(*) from sv_previsoes where custo_total is not null) as processos_com_custo;
