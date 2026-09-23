-- PREVIEW -- só leitura, mostra o caminho do arquivo de assinatura dos 2 romaneios de teste
-- pra apagar depois manualmente pelo Dashboard (Storage > romaneios-assinaturas).

select id, assinatura_path
from romaneios
where id in ('c4749a01-9438-4566-9d69-b91c21805f86', '99b9e664-ee05-4235-89e1-2b851e095307');
