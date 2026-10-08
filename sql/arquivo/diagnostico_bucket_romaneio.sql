-- Só leitura -- confere o nome EXATO do bucket que ficou salvo no Storage (a UI do Dashboard
-- pode ter mudado maiúscula/espaço/traço sem avisar). Rode isso e me mande o resultado.

select id, name, public
from storage.buckets
where name ilike '%romaneio%';
