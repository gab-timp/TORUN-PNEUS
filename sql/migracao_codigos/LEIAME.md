# Troca de códigos de produto — roteiro seguro

Este kit troca o código de produtos (Torun e/ou Sem Venda) sem quebrar estoque,
pedidos, preços, histórico nem fotos. Ele nasceu das lições da migração de
01/10/2026 (43 códigos), que gerou baixas duplicadas e estoque negativo.

## Em uma frase

Você me passa a lista **código antigo → código novo**; o kit confere, ensaia sem
gravar nada, troca tudo de uma vez dentro de uma transação e prova (com contas)
que o saldo de cada produto ficou idêntico.

## Onde o código de produto fica gravado

| Onde | Como é trocado |
|---|---|
| `produtos.codigo` (chave) | UPDATE, com as chaves estrangeiras derrubadas e recriadas |
| `produtos_precos.codigo`, `movimentos.codigo` | UPDATE (chave estrangeira **sem** ON UPDATE CASCADE) |
| `entregas.itens[].codigo` (JSON dos pedidos, inclusive os do portal) | UPDATE do JSON, item por item |
| `previsoes.itens[].codigo` (JSON do Estoque Previsto) | idem |
| `log_alteracoes.registro_id` (só `tabela = 'produtos'`) | UPDATE |
| `notificacoes.link_id` (só `tipo = 'estoque_baixo'`) | UPDATE |
| Sem Venda: `sv_produtos`, `sv_reservas`, `sv_previsoes.itens[]` | `04b_migracao_semvenda.sql` |

**Não precisa mudar nada:**
- **O app (HTML/JS):** não há lógica que dependa do formato do código (conferi: nenhum prefixo, regex ou
  tamanho fixo). Os prefixos como ASCEN/ROYALB aparecem só em exemplos de campo.
- **Fotos:** `produtos.foto_path` guarda o caminho completo (`<código antigo>/1-...png`) e continua
  valendo. Só as fotos novas irão para a pasta do código novo.
- **Textos antigos** (`log_alteracoes.descricao`, `movimentos.obs`) seguem com o código antigo escrito: é
  histórico, não afeta nada.

## O que deu errado em 01/10 e o que o kit faz contra isso

| Problema de 01/10 | Defesa |
|---|---|
| O UPDATE de `entregas.itens` disparou a baixa automática (16 baixas duplicadas, estoque negativo) | O motor desliga os gatilhos das tabelas tocadas e religa os mesmos; o teste prova que **nenhum gatilho dispara** |
| A chave estrangeira `movimentos_codigo_fkey` travou a primeira tentativa | O motor derruba **todas** as chaves que apontam para `produtos` e recria com a definição original |
| Ninguém conferiu o saldo depois | O motor compara o saldo de **todo produto** antes e depois e desfaz tudo se algum mudar |
| Era uma execução única, sem ensaio | Modo **ENSAIO** (padrão): roda tudo, confere e desfaz, mostrando o resumo |
| Script com a lista de códigos escrita dentro | A lista fica numa tabela (`migracao_codigos_mapa`); o motor é sempre o mesmo |

## Antes de começar (o que eu preciso de você)

1. **A lista de-para.** Uma planilha com duas colunas (código antigo, código novo). Eu confiro cada linha
   pela medida e pela marca (o prefixo do código **não** identifica a marca: ROADT é ROADTRACK **e**
   ROADCRUZA).
2. **Quais sistemas:** Torun, Sem Venda ou os dois (o Sem Venda tem cadastro próprio).
3. **A janela.** Fora do expediente, com ninguém no sistema (inclusive representantes no portal). A troca
   em si leva segundos, mas trava as tabelas enquanto roda.
4. **Quem mais usa o código fora do sistema:** planilhas de preço, ERP/notas fiscais, propostas em PDF já
   enviadas. O sistema não atualiza isso sozinho.
5. **Backups em JSON antigos:** depois da troca, **não importe** um backup feito antes dela (ele traria os
   códigos antigos de volta).

## Passo a passo (nesta ordem; um bloco SQL por vez)

| # | Arquivo | O que fazer | O que esperar |
|---|---|---|---|
| 1 | `01_levantamento.sql` | Rodar os 6 blocos, um por vez | Bate com o descrito em cada bloco. Me mande o resultado dos blocos 1 a 3 |
| 2 | `02_backup.sql` | Bloco A, depois B. Faça também **Exportar backup (JSON)** no app e confirme no painel do Supabase que existe backup do dia | Bloco B: `igual = true` em todas |
| 3 | `03_mapa.sql` | Bloco A (cria tabelas), B (preenche o mapa), C (prévia) | Prévia com a medida/marca certas e `novo_ja_existe = false`. Me mande o print antes de seguir |
| 4 | `04_migracao_torun.sql` (e/ou `04b_...semvenda.sql`) | Rodar **como está** (modo ENSAIO) | Um **erro** começando com `ENSAIO CONCLUÍDO — NADA FOI GRAVADO`, com o resumo das linhas que seriam alteradas |
| 5 | o mesmo arquivo | Trocar `'ENSAIO'` por `'REAL'` na linha marcada e rodar | Termina sem erro |
| 6 | `05_verificacao.sql` | Blocos 1 a 6 (e 7 se mexeu no Sem Venda) | Zeros, nenhuma diferença de saldo, gatilhos e chaves como no levantamento |
| 7 | App | Todos dão F5. Conferir: Estoque (saldos), Produtos, Catálogo (fotos e preços), Entregas (abrir pedido antigo), Estoque Previsto, Movimentações, Sem Venda, portal do representante (novo pedido pelo código novo) | Tudo igual ao de antes, só com os códigos novos |

## Se algo der errado

- **Erro no ensaio ou no real:** nada foi gravado (é uma transação). Me mande a mensagem.
- **Depois do `COMMIT`, algo está errado:** o motor grava o de-para em `migracao_codigos_historico`.
  Para desfazer, monte o mapa **inverso** e rode o 04 de novo (primeiro ENSAIO, depois REAL):

  ```sql
  insert into migracao_codigos_mapa (sistema, antigo, novo)
  select sistema, novo, antigo
  from migracao_codigos_historico
  where sistema = 'torun' and aplicado_em::date = date 'AAAA-MM-DD';  -- o dia da migração
  ```
- **Último recurso:** as cópias `bkp_migcod_*` guardam o estado de antes. Não improvise a restauração
  manual: me chame.

## Depois

- Avise a equipe e atualize planilhas de preço e modelos de proposta.
- Uns 30 dias depois, se estiver tudo certo, apague os backups (bloco C do `02_backup.sql`).

## O que foi testado e o que não foi

- **Testado:** um Postgres de teste (PGlite, em memória) com um esquema que imita o real (chaves sem
  ON UPDATE CASCADE, gatilhos que registram quando disparam, JSON de pedidos com casos estranhos: item sem
  código, `itens` nulo, vazio, código órfão). 85 verificações, entre elas: ensaio não grava nada, troca
  real mantém o saldo, nenhum gatilho dispara, gatilho que já estava desligado continua desligado, chaves
  recriadas idênticas, dupla execução recusada, desfazer pelo mapa inverso, e cada conferência de segurança
  abortando sem gravar.
- **Não testado:** o banco real. Por isso o **ensaio** existe: ele roda tudo no banco de verdade, confere e
  desfaz. Se o ensaio passar, o real passa.

## Reforços possíveis para o futuro (decisão sua, nada disso é necessário agora)

1. Recriar as chaves com `ON UPDATE CASCADE` (movimentos, produtos_precos, sv_reservas): a próxima troca
   dispensa derrubar chaves. Os JSON de pedidos e previstos continuariam exigindo o motor.
2. Fazer o "Importar backup" recusar arquivos gerados antes de uma troca de códigos.
3. Trocar `entregas.itens` (JSON) por uma tabela de itens com chave estrangeira: resolve a causa raiz, mas é
   uma refatoração grande e não recomendo agora.
