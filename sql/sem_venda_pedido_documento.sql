-- Sem Venda: número sequencial do "Pedido de venda" (o PDF que vai para o faturamento).
--
-- Cada venda confirmada gera um documento. O número é dado na primeira vez que alguém clica em "Pedido (PDF)" e fica
-- gravado nas linhas da venda: gerar de novo mostra o MESMO número. Os produtos de um pedido vendidos juntos dividem
-- o número (um documento só); uma venda parcial e a venda do restante, em outro dia, têm números diferentes.
--
-- Rode este SQL ANTES de publicar o site: sem a função, o botão "Pedido (PDF)" avisa que falta rodar o SQL.
-- Rode o script INTEIRO no SQL Editor do Supabase (ele mostra só o resultado da última consulta).

create sequence if not exists sv_pedido_numero_seq start 1;

alter table sv_reservas add column if not exists numero_pedido integer;
create index if not exists sv_reservas_numero_pedido_idx on sv_reservas (numero_pedido);

-- Devolve o número do documento das linhas informadas: se alguma já tem número, usa o dele (e completa as demais);
-- se nenhuma tem, pega o próximo da sequência. Só vale para linhas VENDIDA.
create or replace function sv_numero_pedido(p_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  qtd integer;
begin
  if not current_user_pode_acessar_sem_venda() then
    raise exception 'Sem permissão para gerar o pedido.' using errcode = '42501';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Nenhuma venda informada.';
  end if;

  -- trava as linhas: duas pessoas clicando ao mesmo tempo não geram dois números
  perform 1 from sv_reservas where id = any(p_ids) order by id for update;

  select count(*) into qtd from sv_reservas where id = any(p_ids) and situacao = 'VENDIDA';
  if qtd <> array_length(p_ids, 1) then
    raise exception 'Só vendas confirmadas geram o pedido; a lista mudou, atualize a tela.';
  end if;

  select min(numero_pedido) into n from sv_reservas where id = any(p_ids) and numero_pedido is not null;
  if n is null then
    n := nextval('sv_pedido_numero_seq');
  end if;
  update sv_reservas set numero_pedido = n where id = any(p_ids) and numero_pedido is null;
  return n;
end;
$$;

revoke all on function sv_numero_pedido(text[]) from public;
grant execute on function sv_numero_pedido(text[]) to authenticated;

-- conferência: deve listar a coluna nova e a função
select
  (select count(*) from information_schema.columns where table_name = 'sv_reservas' and column_name = 'numero_pedido') as coluna_numero_pedido,
  (select count(*) from pg_proc where proname = 'sv_numero_pedido') as funcao_sv_numero_pedido;
