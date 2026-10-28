# Função `admin-usuarios` (criar usuário pela tela)

Faz o que o site não pode fazer sozinho: **criar o login** de um usuário novo, **liberar o acesso** de um login que já
existe, **redefinir a senha** de quem esqueceu e **listar os logins sem acesso**. Só administrador consegue usar (a função confere `user_roles.is_admin` de quem
chamou antes de fazer qualquer coisa). A chave de serviço do Supabase fica só no servidor, nunca vai para o navegador.

Sem publicar esta função, a tela **Administração > Usuários e acessos** continua funcionando para quem já tem login
(editar acesso). Só o botão **+ Novo usuário**, o botão **Redefinir senha** e o aviso de **logins sem acesso** dependem dela, e a tela avisa quando
ela não foi publicada.

## Publicar (uma vez, uns 3 minutos, sem instalar nada)

1. Supabase > projeto do TORUN > **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Nome da função: `admin-usuarios` (exatamente assim).
3. Apague o exemplo que vem no editor e cole **todo** o conteúdo de `index.ts` (este mesmo diretório).
4. Clique em **Deploy function**. Não precisa configurar chave nenhuma: `SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY` já existem sozinhas dentro de toda função do Supabase.
5. Se na tela aparecer "Invalid JWT" (erro 401) ao criar, abra a função > **Details** e desligue **Verify JWT**
   (a própria função já confere o login e o administrador; o conferidor automático do Supabase só atrapalha em
   projetos com chaves novas). Salve e tente de novo.

Para atualizar depois: abra a função, cole o `index.ts` novo e faça Deploy de novo.

## Testar

Na tela: **Administração > + Novo usuário**, crie um login de teste (ex.: `teste.crm@timptrade.com.br`) com o perfil
"Somente leitura" e entre com ele numa janela anônima. Depois apague o login de teste em Authentication > Users
(a linha em `user_roles` some junto se você rodar: `delete from user_roles where email = 'teste.crm@timptrade.com.br';`
antes de apagar o login).

## O que a função aceita

`POST` com o login de quem chama (o site já manda) e um corpo JSON:

| ação | corpo | resultado |
|---|---|---|
| `pendentes` | `{ acao: "pendentes" }` | `{ pendentes: [{ user_id, email, criado_em }] }` |
| `criar` | `{ acao: "criar", nome, email, senha, perfil }` | cria o login já confirmado + a linha em `user_roles`; se a linha não gravar, apaga o login |
| `liberar` | `{ acao: "liberar", user_id, nome, perfil }` | grava a linha de `user_roles` de um login que já existe (409 se já tem acesso) |
| `redefinir` | `{ acao: "redefinir", user_id, senha }` | troca a senha de um login que já existe (8 a 72 caracteres; 404 se o login sumiu). Não derruba sessões já abertas: isso só por SQL (`delete from auth.sessions where user_id = ...`) |

`perfil` aceita só: `role` (editor, viewer, representante), `is_admin`, `pode_autorizar_gerencia`, `pode_exportar_backup`,
`pode_acessar_sem_venda`, `pode_acessar_portal_representante`, `crm_papel` (executivo, financeiro, gestao ou null),
`crm_sistema` (atacado ou encomenda, só para executivo), `crm_sistemas` (lista com um ou os dois, só para executivo; opcional) e `visible_views` (lista de telas ou null = todas). Qualquer outro
campo é ignorado; a senha nunca volta na resposta nem vai para o log.
