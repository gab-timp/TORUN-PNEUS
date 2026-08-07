-- Regra: qualquer um pode mover um pedido PARA "Autorização de Gerência",
-- mas só um usuário específico (ou administrador) pode tirar o pedido DE LÁ
-- pra outra etapa.
--
-- Rode este SQL no SQL Editor do Supabase.

-- 1) Coluna nova em user_roles: quem tem essa permissão extra, além dos admins.
alter table user_roles add column if not exists pode_autorizar_gerencia boolean not null default false;

-- 2) Libera a pessoa combinada (comercial2@timptrade.com.br):
update user_roles set pode_autorizar_gerencia = true
where user_id = (select id from auth.users where email = 'comercial2@timptrade.com.br');

-- Confira se aplicou (deve trazer 1 linha, com pode_autorizar_gerencia = true):
select ur.nome, u.email, ur.is_admin, ur.pode_autorizar_gerencia
from user_roles ur join auth.users u on u.id = ur.user_id
where u.email = 'comercial2@timptrade.com.br';

-- 3) Trigger que bloqueia a saída de "Autorização de Gerência" pra quem não tem permissão.
-- Funciona pra QUALQUER jeito de mudar a etapa (arrastar no Kanban, editar o pedido pela
-- tela, ou qualquer chamada direta à API) -- é a trava de verdade, o site só evita mostrar
-- a ação pra quem não pode, mas quem decide é o banco.
create or replace function bloquear_saida_autorizacao_gerencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.etapa = 'AUTORIZACAO_GERENCIA' and NEW.etapa is distinct from OLD.etapa then
    if not coalesce(
      (select is_admin or pode_autorizar_gerencia from user_roles where user_id = auth.uid()),
      false
    ) then
      raise exception 'Somente um usuário autorizado pode tirar este pedido de Autorização de Gerência.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_bloquear_saida_autorizacao_gerencia on entregas;
create trigger trg_bloquear_saida_autorizacao_gerencia
before update on entregas
for each row
execute function bloquear_saida_autorizacao_gerencia();
