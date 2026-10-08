-- Apaga os 2 registros de romaneio de teste (NF 123456 e NF 1234, ambos ACOTUBO SOLUÇÕES).
-- O arquivo de assinatura no Storage não sai daqui -- delete direto na tabela storage.objects
-- é bloqueado pelo Supabase (protect_delete()). Apague o(s) arquivo(s) manualmente pelo
-- Dashboard (Storage > romaneios-assinaturas), usando o "assinatura_path" da consulta anterior.
--
-- Rode no SQL Editor do Supabase.

delete from romaneios
where id in ('c4749a01-9438-4566-9d69-b91c21805f86', '99b9e664-ee05-4235-89e1-2b851e095307');

-- Confira (deve voltar vazio):
select r.id
from romaneios r
join entregas e on e.id = r.entrega_id
where e.numero_nf in ('123456', '1234');
