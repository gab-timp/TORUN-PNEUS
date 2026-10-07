-- Extensão da regra anterior (restringir_saida_autorizacao_gerencia.sql).
-- Antes, a trava só pegava quem já estava DENTRO de "Autorização de Gerência"
-- tentando sair. Agora também bloqueia pular a etapa inteira: ir direto de
-- antes dela (Pré-venda ou Entrada) pra depois (Análise de Crédito em diante)
-- sem passar por "Autorização de Gerência".
--
-- Continua liberado pra qualquer um: mover QUALQUER card PARA "Autorização
-- de Gerência" (de onde for). Só quem tem a permissão especial (admin ou
-- pode_autorizar_gerencia) consegue: (a) tirar um card de lá, ou (b) pular
-- a etapa inteira.
--
-- Rode este SQL no SQL Editor do Supabase (substitui a função anterior).

create or replace function bloquear_saida_autorizacao_gerencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ordem text[] := array[
    'PRE_VENDA','ENTRADA','AUTORIZACAO_GERENCIA','ANALISE_CREDITO','AGUARDANDO_PAGAMENTO',
    'VALIDACAO_TRANSPORTE','FATURAMENTO','SEPARACAO','AGUARDANDO_COLETA','COLETA','RASTREIO','FINALIZADOS'
  ];
  idx_ag int := array_position(ordem, 'AUTORIZACAO_GERENCIA');
  idx_old int := array_position(ordem, OLD.etapa);
  idx_new int := array_position(ordem, NEW.etapa);
  precisa_autorizacao boolean;
  usuario_autorizado boolean;
begin
  if NEW.etapa is distinct from OLD.etapa then
    precisa_autorizacao := (OLD.etapa = 'AUTORIZACAO_GERENCIA')
      or (idx_old is not null and idx_new is not null and idx_old < idx_ag and idx_new > idx_ag);

    if precisa_autorizacao then
      select coalesce(is_admin or pode_autorizar_gerencia, false) into usuario_autorizado
      from user_roles where user_id = auth.uid();

      if not coalesce(usuario_autorizado, false) then
        raise exception 'Somente um usuário autorizado pode mover este pedido para depois de Autorização de Gerência.';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

-- O trigger em si continua o mesmo (já criado antes), só a função mudou.
-- Recriar aqui também, por segurança, caso este script rode sozinho:
drop trigger if exists trg_bloquear_saida_autorizacao_gerencia on entregas;
create trigger trg_bloquear_saida_autorizacao_gerencia
before update on entregas
for each row
execute function bloquear_saida_autorizacao_gerencia();
