-- PREVIEW -- só leitura, confere se é o romaneio certo (teste da NF 1234, ACOTUBO SOLUÇÕES)
-- antes de apagar. Depois de conferir, rode o outro arquivo (apaga_romaneio_teste_nf1234.sql).

select r.id, r.entrega_id, r.assinatura_path, r.motorista_nome, r.transportadora,
       r.veiculo_placa, r.assinado_em, e.numero_nf, e.cliente
from romaneios r
join entregas e on e.id = r.entrega_id
where e.numero_nf = '1234';
