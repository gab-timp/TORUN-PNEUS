# SQLs arquivados

Arquivos que já foram executados no Supabase, que foram trocados por uma versão mais nova ou que eram
só diagnóstico de um problema já resolvido. Ficam aqui só como histórico.

**Não rode nenhum deles de novo.** Vários redefinem funções do banco (`create or replace function`), e rodar a
versão antiga faria a função voltar para um estado velho. A definição que vale é a que está no banco:

```sql
select pg_get_functiondef('nome_da_funcao'::regproc);
```

Os SQLs que descrevem a estrutura em vigor (tabelas, colunas, policies, triggers) continuam na pasta `sql/`.
