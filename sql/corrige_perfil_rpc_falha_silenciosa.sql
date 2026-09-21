-- atualizar_meu_perfil() e atualizar_meu_avatar() (sql/perfil_usuario_completo.sql) faziam
-- `update user_roles ... where user_id = auth.uid()` sem checar se achou linha. Quem tem
-- login no Supabase Auth mas NÃO tem linha em user_roles (ex: varejo@timptrade.com.br,
-- ver sql/adicionar_usuario_varejo.sql) ficava com update de 0 linhas: a função voltava
-- sem erro, o app mostrava "Perfil atualizado."/"Foto de perfil atualizada." e, ao
-- recarregar, nome e foto voltavam ao padrão (nome = e-mail, papel Editor, sem foto).
--
-- Agora as duas funções falham com mensagem clara quando não há linha, e o app mostra
-- o erro em vez de dizer que salvou. Mesmas assinaturas, então os grants continuam.
--
-- Aditivo e seguro -- só troca o corpo das funções. Rode no SQL Editor do Supabase.

create or replace function atualizar_meu_perfil(novo_nome text, novo_telefone text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if novo_nome is null or length(trim(novo_nome)) = 0 then
    raise exception 'Nome não pode ficar em branco.';
  end if;
  update user_roles
    set nome = trim(novo_nome),
        telefone = nullif(trim(coalesce(novo_telefone, '')), '')
    where user_id = auth.uid();
  if not found then
    raise exception 'Seu login ainda não tem cadastro de permissões (user_roles). Peça pra um administrador liberar.';
  end if;
end;
$$;

create or replace function atualizar_meu_avatar(novo_avatar_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if novo_avatar_path is not null and novo_avatar_path not like (auth.uid()::text || '/%') then
    raise exception 'Caminho de avatar inválido.';
  end if;
  update user_roles set avatar_path = novo_avatar_path where user_id = auth.uid();
  if not found then
    raise exception 'Seu login ainda não tem cadastro de permissões (user_roles). Peça pra um administrador liberar.';
  end if;
end;
$$;
