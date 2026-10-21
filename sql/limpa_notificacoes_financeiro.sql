-- Limpa o sino do login financeiro@timptrade.com.br.
--
-- As notificações são uma tabela única, igual pra todo mundo (notificacoes), então não dá pra apagar só as
-- dela. O que cada usuário controla é o tipo de aviso que quer receber (user_preferences.notif_*) e o
-- "visto até" (ultima_notificacao_vista_em). Este script desliga os 6 tipos que existem hoje (estoque
-- baixo, proposta nova, proposta virou pedido, pedido parado, previsto chegando e pré-cadastro novo) e
-- marca tudo como visto agora: nenhum deles é do Financeiro, então o sino dela fica vazio e zerado.
--
-- Tipos novos que nascerem sem preferência própria (ex.: um aviso de vencimento do Financeiro) continuam
-- chegando. Se um dia ela ganhar Estoque, Entregas etc., é só ligar os avisos de volta em "Minhas
-- configurações".
--
-- Funciona com o site que já está no ar. A versão nova do site (app.js?v=250) também esconde, pra qualquer
-- login com telas restritas, os avisos de tela que ele não pode abrir.
--
-- Pré-requisito: o login financeiro@timptrade.com.br já existe (sql/adicionar_usuario_financeiro.sql).
--
-- Rode no SQL Editor do Supabase.

do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = 'financeiro@timptrade.com.br';
  if v_id is null then
    raise exception 'O login financeiro@timptrade.com.br não existe em Authentication > Users.';
  end if;

  insert into user_preferences (user_id, notif_nova_proposta, notif_mudanca_etapa, notif_estoque_baixo,
                                notif_precadastro_novo, notif_pedido_parado, notif_previsto_chegando,
                                ultima_notificacao_vista_em)
  values (v_id, false, false, false, false, false, false, now())
  on conflict (user_id) do update set
    notif_nova_proposta = false,
    notif_mudanca_etapa = false,
    notif_estoque_baixo = false,
    notif_precadastro_novo = false,
    notif_pedido_parado = false,
    notif_previsto_chegando = false,
    ultima_notificacao_vista_em = now();
end $$;

-- Confira (deve vir 1 linha, com os 6 avisos em false e "visto até" de agora):
select p.user_id, u.email, p.notif_nova_proposta, p.notif_mudanca_etapa, p.notif_estoque_baixo,
       p.notif_precadastro_novo, p.notif_pedido_parado, p.notif_previsto_chegando, p.ultima_notificacao_vista_em
from user_preferences p
join auth.users u on u.id = p.user_id
where u.email = 'financeiro@timptrade.com.br';
