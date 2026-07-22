# Migrations de banco

Aplicadas automaticamente no deploy por `scripts/run-migrations.sh`.

## Dois níveis

- **Baseline** (`scripts/migrate-schema.sql`) — re-aplicado a **todo deploy**,
  é idempotente (tabelas `IF NOT EXISTS`, procedures `DROP IF EXISTS` +
  `CREATE`). Mantém **todas as stored procedures** em sincronia com o
  repositório. Alterou uma procedure? Basta editar o `migrate-schema.sql`; o
  próximo deploy a re-sincroniza em produção. **Não** crie migration para
  mudança de procedure.

- **Migrations versionadas** (este diretório) — aplicadas **uma única vez**,
  registradas em `schema_migrations`. Use para o que o baseline idempotente
  **não** cobre: `ALTER TABLE` em tabela já existente, backfill/correção de
  dados, criação de índice, etc.

## Convenção

- Nome: `NNNN_descricao_curta.sql` (ex.: `0001_add_col_users_last_login.sql`).
  Ordenado por `sort` — mantenha o prefixo numérico com zero-padding.
- **Forward-only**: nunca edite uma migration já aplicada em produção (o
  runner a considera concluída pelo nome). Para corrigir, crie uma nova.
- Escreva SQL puro (o client `mysql` processa `DELIMITER` se precisar de
  procedures/triggers, mas procedures pertencem ao baseline).
- Idealmente idempotente mesmo assim (`ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`) — barato e evita dor num reprocessamento.

## Por que isto existe

O bug de datas invertidas veio de uma procedure (`filter_options`) que em
produção ainda retornava `sale_date DESC` — a correção para `ASC` estava no
`migrate-schema.sql` mas nunca foi re-aplicada ao banco em execução, porque
até então o schema só era carregado manualmente na migração inicial. Re-aplicar
o baseline a cada deploy fecha essa classe de defasagem.
