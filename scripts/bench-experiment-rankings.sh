#!/usr/bin/env bash
#
# ATENÇÃO: NÃO COPIE ESTE MÉTODO. Ele está aqui como registro do experimento de
# 2026-07-26, não como modelo.
#
# O script compara SQL avulso que IMITA a proc, em vez de medir a proc. Isso
# funcionou para dashboard_rankings por sorte, e FALHOU para area_analysis: a
# variante candidata e a de controle omitiam os mesmos cinco predicados
# NOT EXISTS/OR de filtro, o controle bateu com a proc real dentro de 7% no
# cenário onde as duas versões se comportam igual, e eu li isso como prova de
# fidelidade. A reescrita foi para produção e deixou a tela Área 32% mais lenta.
#
# O jeito certo de testar uma variante de proc:
#   1. criar a proc candidata com OUTRO NOME, com o corpo completo;
#   2. medir com scripts/bench-procs.sh (que aceita --scenario);
#   3. provar correção com scripts/validate-procs.sh;
#   4. derrubar a candidata.
# Ver docs/medicao-performance.md.
#
# Experimento READ-ONLY: "uma varredura + rollups" vs "cinco varreduras".
# Só usa TEMPORARY TABLE (escopo de sessão, some ao desconectar). Não cria
# índice, não altera proc, não escreve em tabela persistente.
set -euo pipefail
set -a; . /home/admin/web/gpa.t00ls.dev/public_html/.env; set +a
M() { MYSQL_PWD="$DB_PASS" mariadb --skip-ssl-verify-server-cert -h "$DB_HOST" -u "$DB_USER" -N -B "$DB_NAME" "$@"; }

LAST=$(M -e "SELECT MAX(sale_date) FROM sales_prod_daily_agg;")
D28=$(M -e "SELECT DATE_SUB('$LAST', INTERVAL 27 DAY);")
echo "janela: $D28 .. $LAST"

# --- A: como a proc faz hoje (5 varreduras, predicado (? IS NULL OR ...)) ---
A_SQL="
SET @f='$D28'; SET @t='$LAST';
SELECT depto AS name, SUM(val_vda) v FROM sales_prod_daily_agg a
  WHERE (@f IS NULL OR a.sale_date>=@f) AND (@t IS NULL OR a.sale_date<=@t) AND a.depto IS NOT NULL
  GROUP BY a.depto ORDER BY v DESC LIMIT 10;
SELECT secao, SUM(val_vda) v FROM sales_prod_daily_agg a
  WHERE (@f IS NULL OR a.sale_date>=@f) AND (@t IS NULL OR a.sale_date<=@t) AND a.secao IS NOT NULL
  GROUP BY a.secao ORDER BY v DESC LIMIT 10;
SELECT grupo, SUM(val_vda) v FROM sales_prod_daily_agg a
  WHERE (@f IS NULL OR a.sale_date>=@f) AND (@t IS NULL OR a.sale_date<=@t) AND a.grupo IS NOT NULL
  GROUP BY a.grupo ORDER BY v DESC LIMIT 10;
SELECT subgrupo, SUM(val_vda) v FROM sales_prod_daily_agg a
  WHERE (@f IS NULL OR a.sale_date>=@f) AND (@t IS NULL OR a.sale_date<=@t) AND a.subgrupo IS NOT NULL
  GROUP BY a.subgrupo ORDER BY v DESC LIMIT 10;
SELECT prod_code, prod_name, SUM(val_vda) v FROM sales_prod_daily_agg a
  WHERE (@f IS NULL OR a.sale_date>=@f) AND (@t IS NULL OR a.sale_date<=@t)
  GROUP BY a.prod_code, a.prod_name ORDER BY v DESC LIMIT 10;
"

# --- B: predicado direto, ainda 5 varreduras (isola o ganho do sargable) ---
B_SQL="$(printf '%s' "$A_SQL" | sed "s/(@f IS NULL OR a.sale_date>=@f)/a.sale_date>='$D28'/g; s/(@t IS NULL OR a.sale_date<=@t)/a.sale_date<='$LAST'/g")"

# --- C: uma varredura para uma temporária no grão fino + 5 rollups baratos ---
C_SQL="
DROP TEMPORARY TABLE IF EXISTS t_per;
CREATE TEMPORARY TABLE t_per ENGINE=InnoDB AS
  SELECT a.depto, a.secao, a.grupo, a.subgrupo, a.prod_code, a.prod_name, SUM(a.val_vda) v
  FROM sales_prod_daily_agg a
  WHERE a.sale_date>='$D28' AND a.sale_date<='$LAST'
  GROUP BY a.depto, a.secao, a.grupo, a.subgrupo, a.prod_code, a.prod_name;
SELECT depto AS name, SUM(v) vv FROM t_per WHERE depto IS NOT NULL GROUP BY depto ORDER BY vv DESC LIMIT 10;
SELECT secao, SUM(v) vv FROM t_per WHERE secao IS NOT NULL GROUP BY secao ORDER BY vv DESC LIMIT 10;
SELECT grupo, SUM(v) vv FROM t_per WHERE grupo IS NOT NULL GROUP BY grupo ORDER BY vv DESC LIMIT 10;
SELECT subgrupo, SUM(v) vv FROM t_per WHERE subgrupo IS NOT NULL GROUP BY subgrupo ORDER BY vv DESC LIMIT 10;
SELECT prod_code, prod_name, SUM(v) vv FROM t_per GROUP BY prod_code, prod_name ORDER BY vv DESC LIMIT 10;
DROP TEMPORARY TABLE t_per;
"

run() { # nome, sql
  local nome="$1" sql="$2" out us
  # aquecimento descartado
  M -e "$sql" > /dev/null 2>&1 || { echo "  $nome: FALHOU"; return; }
  for i in 1 2 3; do
    us=$(M -e "SET @t0=NOW(6); $sql SELECT CONCAT('##T##', TIMESTAMPDIFF(MICROSECOND,@t0,NOW(6)));" \
         2>/dev/null | sed -n 's/^##T##//p' | tail -1)
    printf '  %-28s run%d %6d ms\n' "$nome" "$i" "$(( ${us:-0} / 1000 ))"
  done
  M -e "$sql" 2>/dev/null | LC_ALL=C sort | md5sum | sed "s/^/  $nome hash /"
}

run "A_hoje_5scans_ornull" "$A_SQL"
run "B_5scans_sargable"    "$B_SQL"
run "C_1scan_rollups"      "$C_SQL"
