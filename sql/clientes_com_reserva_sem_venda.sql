-- Excluir/mesclar cliente: avisa antes se o cliente tem reserva no Sem Venda.
--
-- A tabela sv_reservas aponta pro cliente por chave estrangeira "restrict": o banco não deixa
-- apagar um cliente que tem reserva (mesmo cancelada). Sem esta função o app só descobria isso no
-- final, com erro técnico (excluir) ou com a mesclagem parada no meio (mesclar).
--
-- security definer porque o RLS de sv_reservas só deixa ler quem tem acesso ao Sem Venda, e quem
-- exclui/mescla cliente no Torun pode não ter. A função só devolve QUANTAS reservas cada nome tem
-- (nada de quem reservou, produto ou quantidade) e não responde pra representante.
--
-- É segura de rodar a qualquer hora: o app trata erro da função como "não deu pra checar" e segue
-- como antes (o banco continua barrando). Escrita em plpgsql de propósito: não valida a tabela
-- sv_reservas na criação, então roda mesmo antes do SQL do Sem Venda.

create or replace function clientes_com_reserva_sem_venda(p_nomes text[])
returns table(cliente text, reservas bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_user_role(), '') = 'representante' then
    return;
  end if;
  return query
    select r.cliente, count(*)::bigint
    from sv_reservas r
    where r.cliente = any(p_nomes)
    group by r.cliente;
end;
$$;

grant execute on function clientes_com_reserva_sem_venda(text[]) to authenticated;

-- Confere (deve vir 1 linha):
select proname, prosecdef as security_definer
from pg_proc
where proname = 'clientes_com_reserva_sem_venda';
