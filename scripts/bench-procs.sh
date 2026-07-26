#!/usr/bin/env bash
#
# Protocolo de medição das procedures de análise.
#
# POR QUE ESTE SCRIPT EXISTE
#
# A tentativa de otimizar `area_analysis` esbarrou num problema anterior ao
# código: não havia como medir. No MariaDB local o mesmo bloco variou de 8,6s a
# 0,9s entre execuções (buffer pool), um índice de teste apareceu sem ter sido
# criado, e um índice de cobertura em `depto` não mudou nada. Sem número
# confiável, qualquer reescrita de proc é chute — e "ficou mais rápido" vira
# opinião.
#
# O que este script garante, e que faltava:
#
#   1. Mede em PRODUÇÃO. É o único ambiente cujo dataset, hardware (1 núcleo,
#      1,9 GB) e buffer pool são os de verdade. Local não reproduz nenhum dos
#      três.
#   2. Mede o SERVIDOR, não a rede: o cronômetro (NOW(6)) roda dentro da mesma
#      sessão SQL, antes e depois do CALL. Latência de SSH e de conexão ficam
#      de fora.
#   3. Descarta o primeiro tiro. Buffer pool frio mede o disco, não a query.
#      Todas as medidas são de estado quente — que é o estado em que a tela
#      real roda depois do primeiro acesso do dia.
#   4. Repete N vezes e reporta a DISPERSÃO junto com a mediana. A dispersão é
#      o número mais importante do relatório: se max/min passar de ~1,3, a
#      medição não vale e o resto do relatório deve ser ignorado.
#   5. Registra a impressão digital do ambiente (versão, buffer pool, contagem
#      das tabelas, carga) no arquivo de saída. Comparar duas medições feitas
#      com datasets ou buffer pools diferentes é comparar coisa nenhuma.
#   6. Guarda o HASH DO RESULTADO de cada cenário. Performance não pode custar
#      correção: depois de mexer numa proc, o hash tem de bater com o baseline.
#      São dois hashes — um da saída na ordem em que veio (pega mudança de
#      ORDER BY) e um da saída ordenada externamente (pega perda ou ganho de
#      linha mesmo quando há empate de ordenação, que é não-determinístico).
#   7. Recusa-se a rodar sob carga. O app tem 2 usuários e 1 núcleo: medir
#      enquanto alguém usa contamina a medida E piora a vida de quem está
#      usando. Ver [[prod-capacidade-1-core-2-usuarios]].
#
# O script é SOMENTE LEITURA: só executa CALL das procs de análise e SELECTs de
# metadado. Não cria índice, não altera proc, não escreve em tabela.
#
# USO
#
#   Direto no servidor:
#     scripts/bench-procs.sh --out /tmp/bench-antes
#
#   Da máquina de desenvolvimento (o script não precisa estar no servidor):
#     ssh -i ~/.ssh/gpa-key -p 9767 debian@sv1.t00ls.dev \
#       'sudo -u admin bash -s -- --out /tmp/bench-antes' < scripts/bench-procs.sh
#
# Opções: --runs N (default 5), --warmup N (default 1), --out DIR,
#         --env ARQUIVO, --max-load X (default 0.7), --force, --scenario NOME
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

# O .env de produção vive na raiz do app. Quando o script chega por stdin
# (`bash -s`), BASH_SOURCE não aponta para lugar nenhum útil, então há um
# caminho padrão explícito.
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

# -N: sem cabeçalho de coluna, para a linha do cronômetro ser fácil de isolar.
# --skip-ssl-verify-server-cert: sem ele o cliente emite um aviso por invocação
# (são centenas numa bateria) que iria parar dentro dos arquivos de saída.
sql() {
  MYSQL_PWD="$DB_PASS" "$CLIENT" --skip-ssl-verify-server-cert \
    -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -B "$DB_NAME" "$@"
}

# ---------------------------------------------------------------- guarda-corpo
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

# ------------------------------------------------------- impressão digital
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

# ------------------------------------------------------------------ cenários
# Os valores de dimensão saem do próprio banco: o script tem de funcionar em
# qualquer dataset, e um depto hardcoded envelhece.
LAST="$(sql -e "SELECT MAX(sale_date) FROM sales_prod_daily_agg;")"
D7="$(sql -e "SELECT DATE_SUB('$LAST', INTERVAL 6 DAY);")"
D28="$(sql -e "SELECT DATE_SUB('$LAST', INTERVAL 27 DAY);")"
DEPTO="$(sql -e "SELECT depto FROM sales_prod_daily_agg WHERE sale_date>='$D28' GROUP BY depto ORDER BY COUNT(*) DESC LIMIT 1;")"
STORE="$(sql -e "SELECT store_code FROM sales_prod_daily_agg WHERE sale_date>='$D28' GROUP BY store_code ORDER BY COUNT(*) DESC LIMIT 1;")"
J_DEPTO="[\"$(printf '%s' "$DEPTO" | sed 's/"/\\"/g')\"]"
J_STORE="[\"$STORE\"]"
NUL="JSON_ARRAY()"

# nome | chamada SQL completa
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
)

RESULTS="$OUT_DIR/results.tsv"
printf 'cenario\tamostras_ms\tmediana_ms\tmin_ms\tmax_ms\tdispersao\thash_ordem\thash_conjunto\tlinhas\n' > "$RESULTS"

echo "Saída em: $OUT_DIR"
echo "Janela: $D28 .. $LAST (28d) | $D7 .. $LAST (7d) | depto='$DEPTO' loja='$STORE'"
echo

for entry in "${SCENARIOS[@]}"; do
  name="${entry%%|*}"; call="${entry#*|}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && continue

  # Passe de correção: guarda a saída inteira para hash. Roda antes das
  # medições e também serve de aquecimento adicional.
  raw="$OUT_DIR/$name.out"
  if ! sql -e "$call" > "$raw" 2> "$OUT_DIR/$name.err"; then
    echo "  $name: FALHOU — ver $OUT_DIR/$name.err"
    continue
  fi
  h_order="$(md5sum < "$raw" | cut -c1-12)"
  h_set="$(LC_ALL=C sort < "$raw" | md5sum | cut -c1-12)"
  lines="$(wc -l < "$raw")"

  for _ in $(seq 1 "$WARMUP"); do sql -e "$call" > /dev/null 2>&1 || true; done

  samples=()
  for _ in $(seq 1 "$RUNS"); do
    # Sem tab no marcador: o modo batch do cliente escapa tab e newline da
    # saída como "\t" e "\n" literais, então um separador tab não sobrevive.
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
