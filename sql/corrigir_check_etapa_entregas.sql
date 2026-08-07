-- O quadro de Entregas ganhou etapas novas (Pré-venda, Autorização de Gerência,
-- Análise de Crédito, Aguardando Pagamento, Validação de Transporte), mas a trava
-- de banco (check constraint) que valida a coluna "etapa" na tabela entregas ainda
-- só aceitava a lista antiga de valores. Por isso aparece o erro:
--   "new row for relation entregas violates check constraint entregas_etapa_check"
-- ao tentar salvar um pedido/proposta com uma dessas etapas novas.
--
-- Rode este SQL no SQL Editor do Supabase pra liberar todas as etapas atuais.

alter table entregas drop constraint if exists entregas_etapa_check;

alter table entregas add constraint entregas_etapa_check check (
  etapa in (
    'PRE_VENDA',
    'ENTRADA',
    'AUTORIZACAO_GERENCIA',
    'ANALISE_CREDITO',
    'AGUARDANDO_PAGAMENTO',
    'VALIDACAO_TRANSPORTE',
    'FATURAMENTO',
    'SEPARACAO',
    'AGUARDANDO_COLETA',
    'COLETA',
    'RASTREIO',
    'FINALIZADOS',
    'FINANCEIRO' -- etapa antiga, mantida aqui só por segurança caso alguma linha nao migrada ainda exista
  )
);

-- Confira se a trava ficou correta:
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'entregas_etapa_check';
