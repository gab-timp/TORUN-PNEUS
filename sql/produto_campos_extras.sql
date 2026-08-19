-- Produto ganha campos que faltavam pro cadastro completo (pensando no
-- pneumático): marca/fabricante (hoje vivia escondida dentro do texto livre
-- de "medida"), tipo de carcaça, NCM (fiscal) e situação (ativo/descontinuado
-- -- hoje não tinha como tirar um modelo de linha, só existia o "status" de
-- "tem preço cadastrado", que é outra coisa).
--
-- Aditivo e seguro -- pode rodar a qualquer momento, não quebra nada que já existe.
-- Rode no SQL Editor do Supabase.

alter table produtos add column if not exists marca text;
alter table produtos add column if not exists carcaca text;
alter table produtos drop constraint if exists produtos_carcaca_check;
alter table produtos add constraint produtos_carcaca_check check (
  carcaca is null or carcaca in ('RADIAL', 'DIAGONAL')
);

alter table produtos add column if not exists ncm text;

alter table produtos add column if not exists situacao text not null default 'ATIVO';
alter table produtos drop constraint if exists produtos_situacao_check;
alter table produtos add constraint produtos_situacao_check check (
  situacao in ('ATIVO', 'DESCONTINUADO')
);
