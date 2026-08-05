#!/usr/bin/env bash
#
# Applies the database schema during deploy. Two levels:
#
#   1. Idempotent BASELINE (migrate-schema.sql), re-applied on EVERY deploy.
#      Keeps tables (CREATE TABLE IF NOT EXISTS) and, above all, ALL stored
#      procedures (DROP IF EXISTS + CREATE) in sync with the repository.
#      This is what eliminates procedure drift between the versioned file
#      and the production database: the cause of the inverted-dates bug was
#      that the filter_options proc in prod still returned `sale_date DESC`
#      (the revision before the `ASC` fix), because editing the .sql file
#      never re-runs CREATE PROCEDURE against the already-running database.
#
#   2. Forward-only versioned MIGRATIONS (migrations/NNNN_*.sql), applied
#      ONCE and recorded in `schema_migrations`. For changes the idempotent
#      baseline doesn't cover: ALTER TABLE, backfills, etc. (CREATE TABLE IF
#      NOT EXISTS doesn't alter an already-existing table).
#
# Usage:
#   scripts/run-migrations.sh [path-to-.env]
# The .env (default: ../.env relative to this script) needs
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

# MYSQL_PWD keeps the password out of the process list (ps).
export MYSQL_PWD="$DB_PASS"
# `mariadb` client: `mysql` is a deprecated alias on MariaDB 11.4. `--skip-ssl`
# because the connection is local (localhost/Unix socket), where TLS adds
# nothing; without this flag the client pollutes the deploy log with
# "insecure passwordless login".
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
# nullglob: with no files, the loop simply doesn't run. Bash's glob already
# comes lexicographically sorted (LC_COLLATE): the NNNN prefix guarantees the order.
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
