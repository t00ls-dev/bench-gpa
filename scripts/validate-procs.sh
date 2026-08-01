#!/usr/bin/env bash
#
# Prova que uma mudança nas procs de análise NÃO alterou o resultado.
#
# É a metade que falta do `scripts/bench-procs.sh`: aquele mede tempo, este mede
# correção. Tempo sem correção não vale nada: uma proc mais rápida que devolve
# outro número é um bug mais rápido.
#
# COMO USAR
#
#   1. Antes de mexer, com o schema atual aplicado:
#        scripts/validate-procs.sh /tmp/antes.txt
#   2. Edite migrate-schema.sql e reaplique no banco local:
#        mariadb -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < scripts/migrate-schema.sql
#   3. Capture de novo e compare:
#        scripts/validate-procs.sh /tmp/depois.txt
#        diff /tmp/antes.txt /tmp/depois.txt
#
# Um `diff` vazio é a aprovação. Qualquer linha diferente significa que a
# mudança alterou o que o usuário vê, e aí o ganho de tempo é irrelevante.
#
# OS DOIS HASHES
#
# Cada cenário gera dois: `ordem` é da saída como veio (pega mudança de ORDER BY)
# e `conjunto` é da saída ordenada por fora. A distinção existe porque empate de
# ordenação é não-determinístico: duas linhas com o mesmo valor podem trocar de
# lugar entre execuções sem nada estar errado. Se `ordem` divergir mas `conjunto`
# bater, é empate; se `conjunto` divergir, é dado diferente, e isso é sério.
#
# POR QUE ESTES CENÁRIOS
#
# Não são "alguns casos": cada um cobre um caminho que já quebrou ou que a
# reescrita de 2026-07-26 tocou. Datas nulas e período vazio exercitam os ramos
# `p_date IS NULL` e o conjunto vazio (onde COALESCE decide entre 0 e NULL). As
# quatro ordenações mais um `p_sort_by` inválido cobrem a whitelist da proc.
# Busca com e sem match cobre os DOIS ramos do PREPARE de area_analysis, que têm
# contagens de placeholder diferentes, e contagem de placeholder é erro de
# execução, não de compilação, então só aparece rodando.
#
# Roda no banco local por padrão (lê o .env do repo). Somente leitura.
#
set -euo pipefail

OUT="${1:-}"
[ -n "$OUT" ] || { echo "uso: $0 <arquivo-de-saida> [caminho-do-.env]" >&2; exit 2; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${2:-$DIR/../.env}"
[ -f "$ENV_FILE" ] || { echo "ERRO: .env não encontrado em $ENV_FILE" >&2; exit 1; }

set -a; . "$ENV_FILE"; set +a
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASS:?}"

CLIENT="$(command -v mariadb || command -v mysql)"
# --skip-ssl-verify-server-cert: sem ele o cliente emite um aviso por invocação.
# Com stderr indo para o hash, esse aviso viraria parte do que se está comparando.
M() {
  MYSQL_PWD="$DB_PASS" "$CLIENT" --skip-ssl-verify-server-cert \
    -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -N -B "$DB_NAME" "$@"
}

# As dimensões saem do próprio banco: um depto hardcoded envelhece junto com o
# dataset, e aí o cenário deixa de exercitar o filtro sem ninguém perceber.
LAST=$(M -e "SELECT MAX(sale_date) FROM sales_prod_daily_agg;")
[ -n "$LAST" ] || { echo "ERRO: sales_prod_daily_agg vazia, nada a validar" >&2; exit 1; }
D7=$(M -e "SELECT DATE_SUB('$LAST', INTERVAL 6 DAY);")
D28=$(M -e "SELECT DATE_SUB('$LAST', INTERVAL 27 DAY);")
DEPTO=$(M -e "SELECT depto FROM sales_prod_daily_agg WHERE depto IS NOT NULL GROUP BY depto ORDER BY COUNT(*) DESC LIMIT 1;")
SECAO=$(M -e "SELECT secao FROM sales_prod_daily_agg WHERE secao IS NOT NULL GROUP BY secao ORDER BY COUNT(*) DESC LIMIT 1;")
STORE=$(M -e "SELECT store_code FROM sales_prod_daily_agg GROUP BY store_code ORDER BY COUNT(*) DESC LIMIT 1;")

N='JSON_ARRAY()'
esc() { printf '%s' "$1" | sed 's/"/\\"/g'; }
JD="'[\"$(esc "$DEPTO")\"]'"; JS="'[\"$(esc "$SECAO")\"]'"; JL="'[\"$STORE\"]'"

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
  "a_padrao|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_pag2|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,2,50,NULL,'val','desc')"
  "a_sort_val_asc|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,NULL,'val','asc')"
  "a_sort_code|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,NULL,'prod_code','asc')"
  "a_sort_name|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,NULL,'prod_name','asc')"
  "a_sort_lastsale|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,NULL,'last_sale_date','desc')"
  "a_sort_invalido|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,NULL,'x; DROP','desc')"
  "a_busca|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,'A','val','desc')"
  "a_busca_vazia|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,'','val','desc')"
  "a_busca_sem_match|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50,'ZZZQQQ','val','desc')"
  "a_depto|CALL area_analysis('$D7','$LAST',$N,$JD,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_loja|CALL area_analysis('$D7','$LAST',$JL,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_combo|CALL area_analysis('$D7','$LAST',$JL,$JD,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_um_dia|CALL area_analysis('$LAST','$LAST',$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_datas_nulas|CALL area_analysis(NULL,NULL,$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_vazio|CALL area_analysis('1999-01-01','1999-01-02',$N,$N,$N,$N,$N,1,50,NULL,'val','desc')"
  "a_pagina_nula|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,NULL,NULL,NULL,'val','desc')"
  "a_export|CALL area_analysis('$D7','$LAST',$N,$N,$N,$N,$N,1,50000,NULL,'val','desc')"
)

: > "$OUT"
ERRF="$(mktemp)"; trap 'rm -f "$ERRF"' EXIT
falhas=0
for c in "${CASES[@]}"; do
  nome="${c%%|*}"; call="${c#*|}"
  # stderr separado do stdout de propósito: só o resultado entra no hash.
  if ! saida="$(M -e "$call" 2>"$ERRF")"; then
    printf '%-18s ERRO %s\n' "$nome" "$(head -1 "$ERRF")" >> "$OUT"
    falhas=$((falhas + 1))
    continue
  fi
  ho=$(printf '%s' "$saida" | md5sum | cut -c1-12)
  hs=$(printf '%s' "$saida" | LC_ALL=C sort | md5sum | cut -c1-12)
  printf '%-18s ordem=%s conjunto=%s linhas=%s\n' \
    "$nome" "$ho" "$hs" "$(printf '%s' "$saida" | wc -l)" >> "$OUT"
done

echo "$OUT: ${#CASES[@]} cenários, $falhas falha(s)"
echo "janela 7d=$D7..$LAST  28d=$D28..$LAST  depto='$DEPTO' secao='$SECAO' loja='$STORE'"
[ "$falhas" -eq 0 ] || exit 1
