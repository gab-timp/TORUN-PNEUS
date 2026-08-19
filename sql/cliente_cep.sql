-- Cliente ganha um campo de CEP -- hoje o endereço é só uma linha de texto livre
-- (endereco), sem CEP separado, então não dava pra auto-preencher endereço a
-- partir dele (ViaCEP) nem mostrar/filtrar por CEP depois. Mesmo campo em
-- clientes_pendentes, pelo mesmo motivo do tipo_cliente: o pré-cadastro do
-- representante já pode vir com CEP também.
--
-- Aditivo e seguro -- pode rodar a qualquer momento, não quebra nada que já existe.
-- Rode no SQL Editor do Supabase.

alter table clientes add column if not exists cep text;
alter table clientes_pendentes add column if not exists cep text;
