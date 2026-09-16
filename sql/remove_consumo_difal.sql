-- Limpeza do CONSUMO_DIFAL: já foi removido das opções do app (commit e88aed6,
-- set/2026), mas o banco ainda aceita esse valor nas 3 constraints abaixo.
--
-- PASSO 1 -- rode isto sozinho primeiro e leia o resultado antes de continuar.
-- Se as 3 contagens derem 0, pode rodar o PASSO 2 direto (nada pra decidir).
-- Se alguma contagem for > 0, PARE aqui e me mostre o resultado -- ainda existe
-- gente/preço marcado como CONSUMO_DIFAL, e precisa decidir o que fazer com
-- esses dados (ex: recategorizar pra CONSUMO) antes de apertar a constraint,
-- porque preço com DIFAL pode ser genuinamente diferente do CONSUMO comum
-- (imposto diferente) -- misturar errado pode fazer a proposta sair com preço
-- errado pra esses clientes específicos.

select 'clientes' as tabela, count(*) as qtd_consumo_difal from clientes where tipo_cliente = 'CONSUMO_DIFAL'
union all
select 'clientes_pendentes', count(*) from clientes_pendentes where tipo_cliente = 'CONSUMO_DIFAL'
union all
select 'produtos_precos', count(*) from produtos_precos where tipo_cliente = 'CONSUMO_DIFAL';

-- PASSO 2 -- só rode depois de conferir que as 3 contagens acima deram 0.
-- Aperta as constraints pra não aceitar mais CONSUMO_DIFAL como valor válido.
-- Se alguma linha ainda tiver esse valor, o ALTER TABLE abaixo falha na hora
-- (não corrompe nada, só não aplica) -- seguro rodar mesmo sem ter certeza.

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
