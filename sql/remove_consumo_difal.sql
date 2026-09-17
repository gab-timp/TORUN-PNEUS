-- Limpeza do CONSUMO_DIFAL: já foi removido das opções do app (commit e88aed6,
-- set/2026), mas o banco ainda aceitava esse valor nas 3 constraints abaixo.
--
-- Diagnóstico rodado em produção (2026-09-17): clientes = 0, clientes_pendentes = 0,
-- produtos_precos = 1 -- codigo ASCEN000103 (a grade do SQL Editor cortou o
-- código na tela antes, "ASCEN00010", por isso um UPDATE ingênuo bateu de
-- frente com o preço CONSUMO que já existia pro mesmo produto/região/condição).
--
-- ASCEN000103 · SC/RS · A VISTA já tinha DOIS preços: CONSUMO_DIFAL = R$5.000
-- e CONSUMO = R$2.302 -- diferença grande de mais que o dobro, coerente com
-- DIFAL sendo acréscimo de imposto interestadual. Confirmado com o usuário:
-- apaga a linha DIFAL (obsoleta, CONSUMO_DIFAL não é mais selecionável há
-- semanas) e mantém o CONSUMO de R$2.302 que já está em uso.
--
-- Idempotente -- pode rodar de novo sem problema.

delete from produtos_precos where tipo_cliente = 'CONSUMO_DIFAL';

alter table clientes drop constraint if exists clientes_tipo_cliente_check;
alter table clientes add constraint clientes_tipo_cliente_check check (
  tipo_cliente is null or tipo_cliente in ('REVENDA', 'FROTA', 'CONSUMO')
);

alter table clientes_pendentes drop constraint if exists clientes_pendentes_tipo_cliente_check;
alter table clientes_pendentes add constraint clientes_pendentes_tipo_cliente_check check (
  tipo_cliente is null or tipo_cliente in ('REVENDA', 'FROTA', 'CONSUMO')
);

alter table produtos_precos drop constraint if exists produtos_precos_tipo_cliente_check;
alter table produtos_precos add constraint produtos_precos_tipo_cliente_check check (
  tipo_cliente in ('REVENDA', 'FROTA', 'CONSUMO')
);

-- Confira depois: deve dar 0 nas 3 linhas.
select 'clientes' as tabela, count(*) as qtd_consumo_difal from clientes where tipo_cliente = 'CONSUMO_DIFAL'
union all
select 'clientes_pendentes', count(*) from clientes_pendentes where tipo_cliente = 'CONSUMO_DIFAL'
union all
select 'produtos_precos', count(*) from produtos_precos where tipo_cliente = 'CONSUMO_DIFAL';
