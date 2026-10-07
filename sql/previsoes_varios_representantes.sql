-- Estoque previsto com VÁRIOS representantes por processo.
--
-- Até hoje previsoes.representante guardava um nome só (texto). Agora o processo pode ter uma
-- lista: previsoes.representantes (text[]). O que já estava vinculado vira uma lista de 1 nome.
--
-- Aditivo e compatível com a versão antiga do site:
--   * a coluna antiga `representante` NÃO é apagada. O site novo continua gravando nela o primeiro
--     nome da lista, e a política de leitura abaixo aceita os dois jeitos (lista nova OU nome antigo);
--   * por isso o portal do representante não perde nenhum processo durante a troca.
--
-- ORDEM: rode este SQL ANTES de publicar o site novo. Com o site novo no ar e sem a coluna, salvar
-- um processo previsto dá erro ("column representantes does not exist").
--
-- Mesma política de sql/previsoes_representante.sql ("as restrictive" é obrigatório), só trocando a
-- condição: o representante lê o processo se o nome dele (user_roles.nome) estiver na lista.

alter table previsoes add column if not exists representantes text[] not null default '{}';

-- quem já tinha representante vinculado passa a ter uma lista de 1 nome
update previsoes
set representantes = array[trim(representante)]
where representante is not null
  and trim(representante) <> ''
  and representantes = '{}';

drop policy if exists "representante nao le previsoes" on previsoes;
create policy "representante nao le previsoes" on previsoes
  as restrictive
  for select
  using (
    coalesce(current_user_role(), '') <> 'representante'
    or exists (
      select 1 from user_roles ur
      where ur.user_id = auth.uid()
        and (
          trim(lower(ur.nome)) = trim(lower(previsoes.representante))
          or trim(lower(ur.nome)) in (select trim(lower(x)) from unnest(previsoes.representantes) as x)
        )
    )
  );

create index if not exists idx_previsoes_representantes on previsoes using gin (representantes);

-- Confira 1: os processos que tinham representante devem aparecer com a lista preenchida
select numero_processo, representante, representantes
from previsoes
where representante is not null and trim(representante) <> ''
order by numero_processo
limit 20;
