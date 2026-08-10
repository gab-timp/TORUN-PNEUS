-- Bug: renomear um cliente que já tem vendas/entregas dava erro
-- ("violates foreign key constraint vendas_cliente_fkey"). A tela tenta
-- atualizar clientes.nome e DEPOIS vendas.cliente/entregas.cliente pro nome
-- novo, mas a trava de integridade do banco bloqueia a mudança do nome em
-- "clientes" enquanto ainda existem vendas apontando pro nome antigo.
--
-- Corrige trocando a trava pra "ON UPDATE CASCADE": ao renomear o cliente,
-- o banco atualiza sozinho vendas.cliente e entregas.cliente na mesma hora,
-- sem precisar de nenhum passo manual depois.
--
-- Rode no SQL Editor do Supabase.

alter table vendas drop constraint if exists vendas_cliente_fkey;
alter table vendas add constraint vendas_cliente_fkey
  foreign key (cliente) references clientes(nome) on update cascade;

alter table entregas drop constraint if exists entregas_cliente_fkey;
alter table entregas add constraint entregas_cliente_fkey
  foreign key (cliente) references clientes(nome) on update cascade;

-- Confira se as duas ficaram com "ON UPDATE CASCADE":
select conname, pg_get_constraintdef(oid) from pg_constraint
where conname in ('vendas_cliente_fkey', 'entregas_cliente_fkey');
