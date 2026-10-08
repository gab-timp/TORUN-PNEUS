-- Estoque Previsto (Torun): quantidade de contêineres do processo.
--
-- Um número inteiro por processo (previsoes.quantidade_containers, mínimo 1). A coluna aceita nulo
-- de propósito: os processos que já existem ficam sem valor até alguém editá-los (a tela passa a
-- exigir o campo ao salvar uma edição). Aditivo e seguro: não mexe em nenhum dado existente.
--
-- Rode no SQL Editor do Supabase ANTES de publicar o site: sem a coluna, salvar um processo
-- previsto novo (ou editado) falha com "column quantidade_containers does not exist". Ler os
-- processos não depende dela.
--
-- Só a tela do Torun usa a coluna. O portal do representante lê uma lista fixa de colunas de
-- previsoes (não inclui esta) e o Sem Venda tem tabela própria (sv_previsoes), sem este campo.

alter table previsoes
  add column if not exists quantidade_containers integer
  check (quantidade_containers is null or quantidade_containers >= 1);

-- Confere (deve vir 1 linha: integer, YES):
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'previsoes' and column_name = 'quantidade_containers';
