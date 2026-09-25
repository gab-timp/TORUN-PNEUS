-- Histórico estruturado de decisões de crédito (Financeiro Fase 2) -- registra cada
-- vez que alguém define/atualiza o limite de crédito ou a validade da análise de um
-- cliente, com a observação de por quê. Tabela própria (não só log_alteracoes) porque
-- precisa guardar limite/validade/observação de forma consultável, não só uma frase.

create table if not exists credito_analises (
  id uuid primary key default gen_random_uuid(),
  cliente text not null references clientes(nome) on update cascade,
  limite numeric,
  validade date,
  observacao text,
  user_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_credito_analises_cliente on credito_analises (cliente, created_at desc);

alter table credito_analises enable row level security;

-- leitura: editor e viewer (mesmo padrão de leitura interna usado no resto do
-- sistema); representante fica de fora de propósito -- ele só recebe o agregado
-- via saldo_em_aberto_clientes, nunca a análise de crédito linha a linha.
create policy "leitura interna" on credito_analises
  for select to public
  using (current_user_role() <> 'representante'::text);

-- escrita: só editor (mesmo padrão de "atualizacao apenas editor" usado em outras
-- tabelas -- viewer é somente leitura em todo o sistema).
create policy "insercao apenas editor" on credito_analises
  for insert to public
  with check (current_user_role() = 'editor'::text);
