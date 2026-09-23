-- Fecha o achado da revisão de segurança: a policy de UPDATE de `romaneios` (editor)
-- não travava nenhuma regra de estado -- só o app.js recusava cancelar um já assinado
-- ou assinar um já cancelado, e isso dava pra pular chamando o Supabase direto pelo
-- DevTools, sem passar pela tela. Segue o mesmo padrão já usado em
-- restringir_saida_autorizacao_gerencia.sql: "quem decide é o banco, o site só evita
-- mostrar a ação pra quem não pode". Trigger vale pra QUALQUER jeito de escrever na
-- tabela, direto pelo Supabase ou pelo app, e pra qualquer papel (editor ou admin).
--
-- Rode no SQL Editor do Supabase.

create or replace function romaneios_protege_estado()
returns trigger
language plpgsql
as $$
begin
  if NEW.entrega_id is distinct from OLD.entrega_id then
    raise exception 'Não é permitido mudar o pedido/NF vinculado a um romaneio já criado.';
  end if;

  if OLD.assinado_em is not null and NEW.cancelado and not OLD.cancelado then
    raise exception 'Romaneio já assinado não pode ser cancelado.';
  end if;

  if OLD.cancelado and NEW.assinado_em is distinct from OLD.assinado_em then
    raise exception 'Romaneio cancelado não pode ser assinado.';
  end if;

  return NEW;
end;
$$;

drop trigger if exists romaneios_protege_estado_trigger on romaneios;
create trigger romaneios_protege_estado_trigger
  before update on romaneios
  for each row execute function romaneios_protege_estado();

-- Confira (deve aparecer o trigger):
select tgname, tgrelid::regclass, tgenabled from pg_trigger
where tgname = 'romaneios_protege_estado_trigger';
