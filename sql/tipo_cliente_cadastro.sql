-- Cliente ganha uma classificação comercial/fiscal (tipo_cliente): REVENDA, FROTA,
-- CONSUMO ou CONSUMO COM DIFAL. "SC REVENDA" na lista de regiões era um remendo só
-- pra cobrir revenda em SC — agora vira um campo de verdade no cadastro do cliente,
-- usado (junto do estado) pra puxar a tabela de preço certa na proposta.
--
-- Aditivo e seguro — pode rodar a qualquer momento, não quebra nada que já existe.
-- Rode no SQL Editor do Supabase.
--
-- ⚠️ SUPERADO em 2026-09-17: CONSUMO_DIFAL saiu das opções (commit e88aed6) e do
-- banco (sql/remove_consumo_difal.sql apertou as duas constraints abaixo pra não
-- aceitar mais esse valor). Não rode este arquivo de novo como está — ele volta
-- a aceitar CONSUMO_DIFAL. Fica aqui só como histórico de quando essas colunas
-- nasceram.

alter table clientes add column if not exists tipo_cliente text;
alter table clientes drop constraint if exists clientes_tipo_cliente_check;
alter table clientes add constraint clientes_tipo_cliente_check check (
  tipo_cliente is null or tipo_cliente in ('REVENDA', 'FROTA', 'CONSUMO', 'CONSUMO_DIFAL')
);

-- Pré-cadastro enviado pelo representante ganha o mesmo campo, pra já vir
-- classificado quando o escritório aprovar.
alter table clientes_pendentes add column if not exists tipo_cliente text;
alter table clientes_pendentes drop constraint if exists clientes_pendentes_tipo_cliente_check;
alter table clientes_pendentes add constraint clientes_pendentes_tipo_cliente_check check (
  tipo_cliente is null or tipo_cliente in ('REVENDA', 'FROTA', 'CONSUMO', 'CONSUMO_DIFAL')
);
