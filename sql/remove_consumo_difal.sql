-- Limpeza do CONSUMO_DIFAL: já foi removido das opções do app (commit e88aed6,
-- set/2026), mas o banco ainda aceitava esse valor nas 3 constraints abaixo.
--
-- Diagnóstico rodado em produção (2026-09-16): clientes = 0, clientes_pendentes = 0,
-- produtos_precos = 1 (ASCEN00010 · SC/RS · A VISTA · R$5000, sem preço CONSUMO
-- conflitante pra esse mesmo produto/região/condição -- confirmado antes de mexer).
-- Só essa linha precisou de UPDATE; as outras 2 tabelas já estavam limpas.
--
-- Idempotente -- pode rodar de novo sem problema (o UPDATE não acha mais nada
-- pra mudar na segunda vez, e os ALTER TABLE recriam a mesma constraint).

update produtos_precos set tipo_cliente = 'CONSUMO' where tipo_cliente = 'CONSUMO_DIFAL';

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
