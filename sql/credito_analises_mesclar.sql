-- Mesclar clientes leva as análises de crédito do duplicado para o cliente principal.
--
-- Hoje credito_analises só tem permissão de leitura e inserção: nenhum Editor consegue mudar o cliente de uma
-- análise, e a ligação com o cliente (sem "on delete") impede apagar quem tem análise. Resultado: um duplicado
-- com análise nunca saía na mesclagem (dava "Mesclagem parcial" depois de já ter movido vendas e pedidos).
--
-- 1) Editor passa a poder atualizar linhas de credito_analises...
-- 2) ...mas um gatilho só deixa mudar a coluna cliente. Limite, validade, observação, autoria e data são
--    imutáveis: ninguém reescreve o histórico de crédito, só muda a quem ele pertence.
--
-- Excluir cliente continua bloqueado enquanto ele tiver análise (o site avisa antes); só a mesclagem move.
--
-- Ordem: pode rodar antes ou depois do deploy. Sem este SQL, mesclar um duplicado que tem análise para no
-- primeiro cliente com análise e avisa o motivo; mesclar os que não têm análise segue normal.
--
-- Rode no SQL Editor do Supabase.

create or replace function credito_analises_so_cliente_muda()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.limite is distinct from old.limite
     or new.validade is distinct from old.validade
     or new.observacao is distinct from old.observacao
     or new.user_email is distinct from old.user_email
     or new.created_at is distinct from old.created_at then
    raise exception 'Em credito_analises só a coluna cliente pode ser alterada.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_credito_analises_so_cliente_muda on credito_analises;
create trigger trg_credito_analises_so_cliente_muda
  before update on credito_analises
  for each row execute function credito_analises_so_cliente_muda();

drop policy if exists "editor muda cliente da analise" on credito_analises;
create policy "editor muda cliente da analise" on credito_analises for update
  using (current_user_role() = 'editor')
  with check (current_user_role() = 'editor');

-- Confira (1 linha: politica_update = 1 e gatilho = 1):
select
  (select count(*) from pg_policies where tablename = 'credito_analises' and cmd = 'UPDATE') as politica_update,
  (select count(*) from pg_trigger where tgrelid = 'credito_analises'::regclass and tgname = 'trg_credito_analises_so_cliente_muda') as gatilho;
