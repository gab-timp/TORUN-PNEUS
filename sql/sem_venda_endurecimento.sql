-- Sem Venda: travas extras no banco (endurecimento). Aditivo e seguro, nada aqui apaga ou altera dado.
--
-- Pré-requisito: sql/sem_venda_catalogo_e_reservas.sql já rodado (cria sv_reservas e o bucket
-- sem-venda-fotos). Se esse SQL não rodou, este aqui falha com "relation sv_reservas does not exist"
-- e não muda nada.
--
--   1) sv_reservas.situacao só aceita ATIVA, VENDIDA ou CANCELADA (hoje o app já só grava esses
--      três; a trava impede que um valor torto entre por fora do app e quebre o cálculo do saldo).
--      Se existir linha com outro valor, o "add constraint" falha e avisa -- aí me chame antes de
--      forçar qualquer coisa.
--   2) bucket sem-venda-fotos: tamanho máximo de 5 MB por arquivo e só imagens. É o mesmo limite
--      que o app já aplica na tela (5 MB e "image/*"); isto só impede de burlar pelo lado do banco.

alter table sv_reservas drop constraint if exists sv_reservas_situacao_check;
alter table sv_reservas add constraint sv_reservas_situacao_check
  check (situacao in ('ATIVA', 'VENDIDA', 'CANCELADA'));

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/*']
where id = 'sem-venda-fotos';

-- Confere (deve vir 1 linha: constraint existe = true, 5242880 bytes, {image/*}):
select
  exists (select 1 from pg_constraint where conname = 'sv_reservas_situacao_check') as constraint_existe,
  b.file_size_limit,
  b.allowed_mime_types
from storage.buckets b
where b.id = 'sem-venda-fotos';
