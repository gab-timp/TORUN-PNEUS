-- PREVIEW -- só leitura, lista todos os romaneios existentes hoje pra você identificar
-- quais são teste. Me diga os "id" que quer apagar que eu monto o delete em cima disso.

select r.id, r.created_at, r.assinado_em, r.cancelado, e.numero_nf, e.cliente,
       r.transportadora, r.motorista_nome, r.veiculo_placa
from romaneios r
join entregas e on e.id = r.entrega_id
order by r.created_at desc;
