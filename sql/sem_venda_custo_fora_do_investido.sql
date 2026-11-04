-- Sem Venda: caixa "Não considerar como valor investido parado" no processo do Estoque Previsto.
-- Marcada, o custo continua salvo no processo, mas não entra na soma do "Valor investido parado" (Dashboard e Armazenagem).
--
-- Coluna nova (nada existente muda; processos antigos ficam como false = contam normalmente):
--   sv_previsoes.custo_fora_do_investido
--
-- Rode este SQL ANTES de publicar o site: sem a coluna, salvar um processo falha.

alter table sv_previsoes add column if not exists custo_fora_do_investido boolean not null default false;

select
  (select count(*) = 1 from information_schema.columns where table_name = 'sv_previsoes' and column_name = 'custo_fora_do_investido') as coluna,
  (select count(*) from sv_previsoes where custo_fora_do_investido) as processos_fora;
