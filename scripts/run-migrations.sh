#!/usr/bin/env bash
#
# Aplica o schema do banco durante o deploy. Dois níveis:
#
#   1. BASELINE idempotente (migrate-schema.sql), re-aplicado a TODO deploy.
#      Mantém tabelas (CREATE TABLE IF NOT EXISTS) e, sobretudo, TODAS as
#      stored procedures (DROP IF EXISTS + CREATE) em sincronia com o
#      repositório. É isto que elimina a defasagem de procedures entre o
#      arquivo versionado e o banco em produção: a causa do bug de datas
#      invertidas: a proc filter_options em prod ainda retornava
#      `sale_date DESC` (revisão anterior à correção `ASC`), porque editar o
#      .sql nunca re-executa CREATE PROCEDURE no banco já rodando.
#
#   2. MIGRATIONS versionadas forward-only (migrations/NNNN_*.sql), aplicadas
#      UMA vez e registradas em `schema_migrations`. Para mudanças que o
#      baseline idempotente não cobre: ALTER TABLE, backfills, etc.
#      (CREATE TABLE IF NOT EXISTS não altera tabela já existente).
#
# Uso:
#   scripts/run-migrations.sh [caminho-do-.env]
# O .env (default: ../.env relativo a este script) precisa de
# DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-$DIR/../.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: arquivo .env não encontrado em: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DB_HOST:?DB_HOST ausente no .env}"
: "${DB_NAME:?DB_NAME ausente no .env}"
: "${DB_USER:?DB_USER ausente no .env}"
: "${DB_PASS:?DB_PASS ausente no .env}"

# MYSQL_PWD mantém a senha fora da lista de processos (ps).
export MYSQL_PWD="$DB_PASS"
# Cliente `mariadb`: `mysql` é um alias deprecado no MariaDB 11.4. `--skip-ssl`
# porque a conexão é local (localhost/socket Unix), onde TLS não agrega; sem essa
# flag o client polui o log de deploy com "insecure passwordless login".
MYSQL=(mariadb --skip-ssl --host="$DB_HOST" --port="${DB_PORT:-3306}" --user="$DB_USER" "$DB_NAME")

echo "==> [1/3] Baseline idempotente (tabelas + procedures)"
"${MYSQL[@]}" < "$DIR/migrate-schema.sql"

echo "==> [2/3] Garantindo tabela de controle schema_migrations"
"${MYSQL[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(255) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL

echo "==> [3/3] Migrations versionadas (forward-only)"
# nullglob: sem arquivos, o loop simplesmente não executa. O glob do bash já
# vem ordenado lexicograficamente (LC_COLLATE): o prefixo NNNN garante a ordem.
shopt -s nullglob
applied_any=0
for f in "$DIR"/migrations/*.sql; do
  version="$(basename "$f")"
  exists="$("${MYSQL[@]}" -N -B -e \
    "SELECT 1 FROM schema_migrations WHERE version = '${version}' LIMIT 1")"
  if [ -n "$exists" ]; then
    echo "    - ${version} (já aplicada)"
    continue
  fi
  echo "    - ${version} (APLICANDO)"
  "${MYSQL[@]}" < "$f"
  "${MYSQL[@]}" -e "INSERT INTO schema_migrations (version) VALUES ('${version}')"
  applied_any=1
done
[ "$applied_any" -eq 0 ] && echo "    (nenhuma migration nova)"

echo "==> Migrations concluídas com sucesso"
