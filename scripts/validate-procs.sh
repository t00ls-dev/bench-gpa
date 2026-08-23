#!/usr/bin/env bash
#
# Proves that a change to the analysis procs did NOT alter the result.
#
# This is the missing other half of `scripts/bench-procs.sh`: that one
# measures time, this one measures correctness. Time without correctness is
# worthless: a faster proc that returns a different number is just a faster bug.
#
# HOW TO USE
#
#   1. Before making a change, with the current schema applied:
#        scripts/validate-procs.sh /tmp/antes.txt
#   2. Edit migrate-schema.sql and reapply to the local database:
#        mariadb -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < scripts/migrate-schema.sql
#   3. Capture again and compare:
#        scripts/validate-procs.sh /tmp/depois.txt
#        diff /tmp/antes.txt /tmp/depois.txt
#
# An empty `diff` is the approval. Any differing line means the change
# altered what the user sees, and then the time gain is irrelevant.
#
# THE TWO HASHES
#
# Each scenario generates two: `ordem` is of the output as it came (catches
# an ORDER BY change) and `conjunto` is of the externally sorted output. The
# distinction exists because a sort tie is non-deterministic: two rows with
# the same value can swap places between runs with nothing being wrong. If
# `ordem` diverges but `conjunto` matches, it's a tie; if `conjunto`
# diverges, the data is different, and that's serious.
#
# WHY THESE SCENARIOS
#
# They aren't "a few cases": each one covers a path that has broken before
# or that the 2026-07-26 rewrite touched. Null dates and an empty period
# exercise the `p_date IS NULL` branches and the empty set (where COALESCE
# decides between 0 and NULL). The four sort orders plus an invalid
# `p_sort_by` cover the proc's whitelist. Search with and without a match
# covers BOTH branches of area_analysis's PREPARE, which have different
# placeholder counts, and a placeholder-count mismatch is a runtime error,
# not a compile-time one, so it only shows up when actually run.
#
# Runs against the local database by default (reads the repo's .env). Read-only.
#
set -euo pipefail

OUT="${1:-}"
[ -n "$OUT" ] || { echo "usage: $0 <output-file> [path-to-.env]" >&2; exit 2; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${2:-$DIR/../.env}"
[ -f "$ENV_FILE" ] || { echo "ERROR: .env not found at $ENV_FILE" >&2; exit 1; }

set -a; . "$ENV_FILE"; set +a
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASS:?}"

CLIENT="$(command -v mariadb || command -v mysql)"
# --skip-ssl-verify-server-cert: without it the client emits a warning per
# invocation. With stderr feeding the hash, that warning would become part
# of what's being compared.
M() {
  MYSQL_PWD="$DB_PASS" "$CLIENT" --skip-ssl-verify-server-cert \
    -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -N -B "$DB_NAME" "$@"
}

# The dimensions come straight from the database: a hardcoded depto goes
# stale along with the dataset, and then the scenario stops exercising the
# filter without anyone noticing.
LAST=$(M -e "SELECT MAX(sale_date) FROM sales_prod_daily_agg;")
[ -n "$LAST" ] || { echo "ERROR: sales_prod_daily_agg is empty, nothing to validate" >&2; exit 1; }
D7=$(M -e "SELECT DATE_SUB('$LAST', INTERVAL 6 DAY);")
D28=$(M -e "SELECT DATE_SUB('$LAST', INTERVAL 27 DAY);")
DEPTO=$(M -e "SELECT depto FROM sales_prod_daily_agg WHERE depto IS NOT NULL GROUP BY depto ORDER BY COUNT(*) DESC LIMIT 1;")
SECAO=$(M -e "SELECT secao FROM sales_prod_daily_agg WHERE secao IS NOT NULL GROUP BY secao ORDER BY COUNT(*) DESC LIMIT 1;")
STORE=$(M -e "SELECT store_code FROM sales_prod_daily_agg GROUP BY store_code ORDER BY COUNT(*) DESC LIMIT 1;")
PROD=$(M -e "SELECT prod_code FROM product_universe ORDER BY last_sale_date DESC LIMIT 1;")

N='JSON_ARRAY()'
esc() { printf '%s' "$1" | sed 's/"/\\"/g'; }
JD="'[\"$(esc "$DEPTO")\"]'"; JS="'[\"$(esc "$SECAO")\"]'"; JL="'[\"$STORE\"]'"; JP="'[\"$(esc "$PROD")\"]'"

CASES=(
  # dashboard_metrics
  "m_28d|CALL dashboard_metrics('$D28','$LAST',$N,$N,$N,$N,$N)"
  "m_7d|CALL dashboard_metrics('$D7','$LAST',$N,$N,$N,$N,$N)"
  "m_depto|CALL dashboard_metrics('$D28','$LAST',$N,$JD,$N,$N,$N)"
  "m_loja|CALL dashboard_metrics('$D28','$LAST',$JL,$N,$N,$N,$N)"
  "m_secao|CALL dashboard_metrics('$D28','$LAST',$N,$N,$JS,$N,$N)"
  "m_combo|CALL dashboard_metrics('$D28','$LAST',$JL,$JD,$N,$N,$N)"
  "m_um_dia|CALL dashboard_metrics('$LAST','$LAST',$N,$N,$N,$N,$N)"
  "m_datas_nulas|CALL dashboard_metrics(NULL,NULL,$N,$N,$N,$N,$N)"
  "m_vazio|CALL dashboard_metrics('1999-01-01','1999-01-02',$N,$N,$N,$N,$N)"
  # dashboard_rankings
  "r_28d|CALL dashboard_rankings('$D28','$LAST',$N,$N,$N,$N,$N,10)"
  "r_7d|CALL dashboard_rankings('$D7','$LAST',$N,$N,$N,$N,$N,10)"
  "r_depto|CALL dashboard_rankings('$D28','$LAST',$N,$JD,$N,$N,$N,10)"
  "r_loja|CALL dashboard_rankings('$D28','$LAST',$JL,$N,$N,$N,$N,10)"
  "r_secao|CALL dashboard_rankings('$D28','$LAST',$N,$N,$JS,$N,$N,10)"
  "r_combo|CALL dashboard_rankings('$D28','$LAST',$JL,$JD,$N,$N,$N,10)"
  "r_limit_3|CALL dashboard_rankings('$D28','$LAST',$N,$N,$N,$N,$N,3)"
  "r_limit_null|CALL dashboard_rankings('$D28','$LAST',$N,$N,$N,$N,$N,NULL)"
  "r_datas_nulas|CALL dashboard_rankings(NULL,NULL,$N,$N,$N,$N,$N,10)"
  "r_vazio|CALL dashboard_rankings('1999-01-01','1999-01-02',$N,$N,$N,$N,$N,10)"
  # area_analysis
  "a_padrao|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_pag2|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,2,50,NULL,'val','desc')"
  "a_sort_val_asc|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,NULL,'val','asc')"
  "a_sort_code|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,NULL,'prod_code','asc')"
  "a_sort_name|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,NULL,'prod_name','asc')"
  "a_sort_lastsale|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,NULL,'last_sale_date','desc')"
  "a_sort_invalido|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,NULL,'x; DROP','desc')"
  "a_busca|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,'A','val','desc')"
  "a_busca_vazia|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,'','val','desc')"
  "a_busca_sem_match|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50,'ZZZQQQ','val','desc')"
  "a_depto|CALL area_analysis_v2('$D7','$LAST',$N,$JD,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_loja|CALL area_analysis_v2('$D7','$LAST',$JL,$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_combo|CALL area_analysis_v2('$D7','$LAST',$JL,$JD,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_produto|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$JP,1,50,NULL,'val','desc')"
  "a_um_dia|CALL area_analysis_v2('$LAST','$LAST',$N,$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_datas_nulas|CALL area_analysis_v2(NULL,NULL,$N,$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_vazio|CALL area_analysis_v2('1999-01-01','1999-01-02',$N,$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_pagina_nula|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,NULL,NULL,NULL,'val','desc')"
  "a_export|CALL area_analysis_v2('$D7','$LAST',$N,$N,$N,$N,$N,$N,1,50000,NULL,'val','desc')"
)

: > "$OUT"
ERRF="$(mktemp)"; trap 'rm -f "$ERRF"' EXIT
falhas=0
for c in "${CASES[@]}"; do
  nome="${c%%|*}"; call="${c#*|}"
  # stderr deliberately separate from stdout: only the result goes into the hash.
  if ! saida="$(M -e "$call" 2>"$ERRF")"; then
    printf '%-18s ERROR %s\n' "$nome" "$(head -1 "$ERRF")" >> "$OUT"
    falhas=$((falhas + 1))
    continue
  fi
  ho=$(printf '%s' "$saida" | md5sum | cut -c1-12)
  hs=$(printf '%s' "$saida" | LC_ALL=C sort | md5sum | cut -c1-12)
  printf '%-18s order=%s set=%s rows=%s\n' \
    "$nome" "$ho" "$hs" "$(printf '%s' "$saida" | wc -l)" >> "$OUT"
done

echo "$OUT: ${#CASES[@]} scenarios, $falhas failure(s)"
echo "window 7d=$D7..$LAST  28d=$D28..$LAST  depto='$DEPTO' secao='$SECAO' loja='$STORE'"
[ "$falhas" -eq 0 ] || exit 1
