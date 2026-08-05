#!/usr/bin/env bash
#
# Measurement protocol for the analysis procedures.
#
# WHY THIS SCRIPT EXISTS
#
# The attempt to optimize `area_analysis` ran into a problem upstream of the
# code: there was no way to measure it. On local MariaDB the same block
# varied from 8.6s to 0.9s between runs (buffer pool), a test index showed up
# without ever having been created, and a covering index on `depto` changed
# nothing. Without a reliable number, any proc rewrite is a guess, and "it
# got faster" turns into opinion.
#
# What this script guarantees, and what was missing:
#
#   1. Measures in PRODUCTION. It's the only environment whose dataset,
#      hardware (1 core, 1.9 GB), and buffer pool are the real ones. Local
#      reproduces none of the three.
#   2. Measures the SERVER, not the network: the stopwatch (NOW(6)) runs
#      inside the same SQL session, before and after the CALL. SSH and
#      connection latency stay out of it.
#   3. Discards the first shot. A cold buffer pool measures the disk, not
#      the query. Every measurement is of the warm state, which is the state
#      the real screen runs in after the first access of the day.
#   4. Repeats N times and reports the SPREAD alongside the median. The
#      spread is the most important number in the report: if max/min goes
#      above ~1.3, the measurement isn't trustworthy and the rest of the
#      report should be ignored.
#   5. Records the environment's fingerprint (version, buffer pool, table
#      counts, load) in the output file. Comparing two measurements taken
#      with different datasets or buffer pools compares nothing meaningful.
#   6. Keeps the RESULT HASH for each scenario. Performance can't come at
#      the cost of correctness: after touching a proc, the hash has to match
#      the baseline. There are two hashes: one of the output in the order it
#      came in (catches an ORDER BY change) and one of the externally sorted
#      output (catches a lost or gained row even when there's a sort tie,
#      which is non-deterministic).
#   7. Refuses to run under load. The app has 2 users and 1 core: measuring
#      while someone is using it contaminates the measurement AND makes life
#      worse for whoever is using it. See [[prod-capacidade-1-core-2-usuarios]].
#
# The script is READ-ONLY: it only runs CALL on the analysis procs and
# metadata SELECTs. It creates no index, alters no proc, writes no table.
#
# USAGE
#
#   Directly on the server:
#     scripts/bench-procs.sh --out /tmp/bench-antes
#
#   From the dev machine (the script doesn't need to live on the server):
#     ssh -i ~/.ssh/gpa-key -p 9767 debian@sv1.t00ls.dev \
#       'sudo -u admin bash -s -- --out /tmp/bench-antes' < scripts/bench-procs.sh
#
# Options: --runs N (default 5), --warmup N (default 1), --out DIR,
#          --env FILE, --max-load X (default 0.7), --force, --scenario NAME
#
set -euo pipefail

RUNS=5
WARMUP=1
OUT_DIR=""
ENV_FILE=""
MAX_LOAD="0.7"
FORCE=0
ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --runs) RUNS="$2"; shift 2 ;;
    --warmup) WARMUP="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --env) ENV_FILE="$2"; shift 2 ;;
    --max-load) MAX_LOAD="$2"; shift 2 ;;
    --scenario) ONLY="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

# Production's .env lives at the app root. When the script arrives via
# stdin (`bash -s`), BASH_SOURCE doesn't point anywhere useful, so there's
# an explicit default path.
if [ -z "$ENV_FILE" ]; then
  for cand in "/home/admin/web/gpa.t00ls.dev/public_html/.env" \
              "$(dirname "${BASH_SOURCE[0]:-.}")/../.env" \
              "./.env"; do
    [ -f "$cand" ] && { ENV_FILE="$cand"; break; }
  done
fi
[ -f "${ENV_FILE:-}" ] || { echo "ERRO: .env não encontrado (use --env)" >&2; exit 1; }

set -a; . "$ENV_FILE"; set +a
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASS:?}"
DB_PORT="${DB_PORT:-3306}"

CLIENT="$(command -v mariadb || command -v mysql)" || {
  echo "ERRO: nenhum cliente mariadb/mysql no PATH" >&2; exit 1; }

OUT_DIR="${OUT_DIR:-/tmp/bench-procs-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR"

# -N: no column header, so the stopwatch line is easy to isolate.
# --skip-ssl-verify-server-cert: without it the client emits a warning per
# invocation (there are hundreds in a batch) that would end up inside the
# output files.
sql() {
  MYSQL_PWD="$DB_PASS" "$CLIENT" --skip-ssl-verify-server-cert \
    -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -B "$DB_NAME" "$@"
}

# ------------------------------------------------------------------ guard rail
LOAD1="$(awk '{print $1}' /proc/loadavg)"
ACTIVE="$(sql -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE COMMAND NOT IN ('Sleep','Daemon') AND ID != CONNECTION_ID();")"
if [ "$FORCE" -eq 0 ]; then
  if awk -v l="$LOAD1" -v m="$MAX_LOAD" 'BEGIN{exit !(l>m)}'; then
    echo "ABORTADO: load1=$LOAD1 acima de $MAX_LOAD. Medir sob carga contamina a" >&2
    echo "medida e rouba o único núcleo de quem está usando. Use --force se souber" >&2
    echo "o que está fazendo, ou espere a janela de baixo uso." >&2
    exit 3
  fi
  if [ "${ACTIVE:-0}" -gt 0 ]; then
    echo "ABORTADO: $ACTIVE consulta(s) ativa(s) no banco além desta sessão." >&2
    exit 3
  fi
fi

# ------------------------------------------------------------- fingerprint
FP="$OUT_DIR/environment.txt"
{
  echo "quando_utc=$(date -u +%FT%TZ)"
  echo "host=$(hostname)"
  echo "load_inicial=$(cat /proc/loadavg)"
  echo "runs=$RUNS warmup=$WARMUP"
  sql -e "
    SELECT CONCAT('versao=', VERSION());
    SELECT CONCAT('buffer_pool_bytes=', @@innodb_buffer_pool_size);
    SELECT CONCAT('uptime_s=', VARIABLE_VALUE) FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME='UPTIME';
    SELECT CONCAT('bp_pages_data=', VARIABLE_VALUE) FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME='INNODB_BUFFER_POOL_PAGES_DATA';
    SELECT CONCAT('bp_pages_free=', VARIABLE_VALUE) FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME='INNODB_BUFFER_POOL_PAGES_FREE';
    SELECT CONCAT('linhas_agg=', COUNT(*)) FROM sales_prod_daily_agg;
    SELECT CONCAT('linhas_universe=', COUNT(*)) FROM product_universe;
    SELECT CONCAT('linhas_products=', COUNT(*)) FROM products;
    SELECT CONCAT('datas=', COUNT(DISTINCT sale_date), ' de ', MIN(sale_date), ' a ', MAX(sale_date)) FROM sales_prod_daily_agg;
  "
  echo "-- indices em sales_prod_daily_agg e product_universe:"
  sql -e "SELECT CONCAT(TABLE_NAME,'.',INDEX_NAME,' (',GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX),')')
          FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('sales_prod_daily_agg','product_universe')
          GROUP BY TABLE_NAME, INDEX_NAME ORDER BY TABLE_NAME, INDEX_NAME;"
} > "$FP"

# ------------------------------------------------------------------ scenarios
# The dimension values come straight from the database: the script has to
# work on any dataset, and a hardcoded depto goes stale.
LAST="$(sql -e "SELECT MAX(sale_date) FROM sales_prod_daily_agg;")"
D7="$(sql -e "SELECT DATE_SUB('$LAST', INTERVAL 6 DAY);")"
D28="$(sql -e "SELECT DATE_SUB('$LAST', INTERVAL 27 DAY);")"
DEPTO="$(sql -e "SELECT depto FROM sales_prod_daily_agg WHERE sale_date>='$D28' GROUP BY depto ORDER BY COUNT(*) DESC LIMIT 1;")"
STORE="$(sql -e "SELECT store_code FROM sales_prod_daily_agg WHERE sale_date>='$D28' GROUP BY store_code ORDER BY COUNT(*) DESC LIMIT 1;")"
# product_analysis (docs/continuar.md item 3) does 7 scans of
# sales_prod_daily_agg, all filtered by prod_code = ?, including
# lastFourSameWeekday/lastFourAll, which have no date limit beyond
# v_ref_date, i.e. they scan that product's entire history. The expected
# cost scales with the product's volume, not the period, hence the two
# extremes: the product with the most rows in the whole table and the one
# with the fewest.
PROD_HIGH="$(sql -e "SELECT prod_code FROM sales_prod_daily_agg GROUP BY prod_code ORDER BY COUNT(*) DESC LIMIT 1;")"
PROD_LOW="$(sql -e "SELECT prod_code FROM sales_prod_daily_agg GROUP BY prod_code ORDER BY COUNT(*) ASC LIMIT 1;")"
J_DEPTO="[\"$(printf '%s' "$DEPTO" | sed 's/"/\\"/g')\"]"
J_STORE="[\"$STORE\"]"
NUL="JSON_ARRAY()"

# name | full SQL call
SCENARIOS=(
"area_7d_sem_filtro|CALL area_analysis('$D7','$LAST',$NUL,$NUL,$NUL,$NUL,$NUL,1,50,NULL,'val','desc')"
"area_28d_sem_filtro|CALL area_analysis('$D28','$LAST',$NUL,$NUL,$NUL,$NUL,$NUL,1,50,NULL,'val','desc')"
"area_28d_depto|CALL area_analysis('$D28','$LAST',$NUL,'$J_DEPTO',$NUL,$NUL,$NUL,1,50,NULL,'val','desc')"
"area_28d_loja|CALL area_analysis('$D28','$LAST','$J_STORE',$NUL,$NUL,$NUL,$NUL,1,50,NULL,'val','desc')"
"area_28d_export|CALL area_analysis('$D28','$LAST',$NUL,$NUL,$NUL,$NUL,$NUL,1,50000,NULL,'val','desc')"
"area_28d_busca|CALL area_analysis('$D28','$LAST',$NUL,$NUL,$NUL,$NUL,$NUL,1,50,'ARROZ','val','desc')"
"rankings_28d|CALL dashboard_rankings('$D28','$LAST',$NUL,$NUL,$NUL,$NUL,$NUL,10)"
"metrics_28d|CALL dashboard_metrics('$D28','$LAST',$NUL,$NUL,$NUL,$NUL,$NUL)"
"filtros_28d|CALL filter_options('$D28','$LAST',$NUL,$NUL,$NUL,$NUL)"
"produto_alto_volume|CALL product_analysis('$PROD_HIGH',$NUL,NULL)"
"produto_baixo_volume|CALL product_analysis('$PROD_LOW',$NUL,NULL)"
)

RESULTS="$OUT_DIR/results.tsv"
printf 'cenario\tamostras_ms\tmediana_ms\tmin_ms\tmax_ms\tdispersao\thash_ordem\thash_conjunto\tlinhas\n' > "$RESULTS"

echo "Saída em: $OUT_DIR"
echo "Janela: $D28 .. $LAST (28d) | $D7 .. $LAST (7d) | depto='$DEPTO' loja='$STORE'"
echo "Produtos: alto_volume='$PROD_HIGH' baixo_volume='$PROD_LOW'"
echo

for entry in "${SCENARIOS[@]}"; do
  name="${entry%%|*}"; call="${entry#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && continue

  # Correctness pass: keeps the entire output for hashing. Runs before the
  # measurements and also serves as extra warmup.
  raw="$OUT_DIR/$name.out"
  if ! sql -e "$call" > "$raw" 2> "$OUT_DIR/$name.err"; then
    echo "  $name: FALHOU, ver $OUT_DIR/$name.err"
    continue
  fi
  h_order="$(md5sum < "$raw" | cut -c1-12)"
  h_set="$(LC_ALL=C sort < "$raw" | md5sum | cut -c1-12)"
  lines="$(wc -l < "$raw")"

  for _ in $(seq 1 "$WARMUP"); do sql -e "$call" > /dev/null 2>&1 || true; done

  samples=()
  for _ in $(seq 1 "$RUNS"); do
    # No tab in the marker: the client's batch mode escapes tabs and
    # newlines in the output as literal "\t" and "\n", so a tab separator
    # doesn't survive.
    us="$(sql -e "SET @t0=NOW(6); $call; SELECT CONCAT('##T##', TIMESTAMPDIFF(MICROSECOND,@t0,NOW(6)));" \
          2>/dev/null | sed -n 's/^##T##//p' | tail -1)"
    samples+=("$(( ${us:-0} / 1000 ))")
  done

  read -r med lo hi disp <<<"$(printf '%s\n' "${samples[@]}" | sort -n | awk '
    {v[NR]=$1} END {
      n=NR; m=(n%2)?v[(n+1)/2]:int((v[n/2]+v[n/2+1])/2);
      printf "%d %d %d %.2f", m, v[1], v[n], (v[1]>0? v[n]/v[1] : 0);
    }')"

  joined="$(IFS=,; echo "${samples[*]}")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$name" "$joined" "$med" "$lo" "$hi" "$disp" "$h_order" "$h_set" "$lines" >> "$RESULTS"

  flag=""
  awk -v d="$disp" 'BEGIN{exit !(d>1.3)}' && flag="  <-- DISPERSÃO ALTA, não confiar"
  printf '  %-22s mediana %6s ms  (min %s / max %s, disp %sx)%s\n' \
    "$name" "$med" "$lo" "$hi" "$disp" "$flag"
done

echo "load_final=$(cat /proc/loadavg)" >> "$FP"
echo
echo "Impressão digital: $FP"
echo "Tabela: $RESULTS"
echo
echo "Para comparar com uma medição anterior:"
echo "  diff <(cut -f1,3,7,8,9 ANTES/results.tsv) <(cut -f1,3,7,8,9 $OUT_DIR/results.tsv)"
echo "Os hashes (colunas 7 e 8) TÊM de bater. Se não baterem, a mudança alterou"
echo "o resultado e o ganho de tempo é irrelevante."
