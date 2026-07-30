#!/bin/bash
# setup-crons.sh — Instala/atualiza as crons do Bench GPA
# Uso: bash scripts/setup-crons.sh
#
# ⚠️ NÃO RODE ISTO EM PRODUÇÃO. Lá quem é dono do crontab é o HestiaCP: a fonte
# de verdade é /usr/local/hestia/data/users/admin/cron.conf, e o crontab cru é
# gerado a partir dela. Este script escreve direto com `crontab`, então mexeria
# só no lado gerado — que o Hestia sobrescreve na próxima alteração, desfazendo
# a mudança sem avisar.
#
# Em produção, usar as ferramentas do Hestia:
#   sudo /usr/local/hestia/bin/v-add-cron-job admin '0' '3' '*' '*' '*' '<cmd>'
#   sudo /usr/local/hestia/bin/v-change-cron-job / v-delete-cron-job
#
# Este script serve para ambiente próprio (dev, ou uma VPS sem painel).

set -euo pipefail

BENCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN_DIR="$(dirname "$(command -v bun 2>/dev/null)" 2>/dev/null || echo /root/.bun/bin)"

# A importação NÃO tem cron. Ela acontece pela tela /upload do app, que é o
# caminho normal, ou sob demanda no servidor com `bun run cli:import <arquivo>`
# (um arquivo) ou `bun run cli:watch` (varre o inbox em data/).
#
# O cron do cli:watch existia porque as planilhas chegavam pelo git e alguém
# precisava reagir a elas; foi desligado em 2026-07-26 junto com a saída dos
# dados do versionamento. Os scripts continuam disponíveis para uso manual — se
# um dia voltar a fazer sentido automatizar, reintroduzir a linha aqui E o job
# em KNOWN_JOBS (src/lib/admin-system.functions.ts), senão o painel admin não
# monitora.
#
# O "0 3"/"30 3" abaixo são a fonte real dos horários de purge e
# refresh-universe. TS não lê bash, então o painel admin mostra um texto solto
# (PURGE_CRON_LABEL/REFRESH_UNIVERSE_CRON_LABEL em src/lib/retention.ts)
# descrevendo o mesmo horário. Mudar aqui (ou no v-add-cron-job do Hestia em
# produção) sem mudar lá deixa o painel exibindo um horário que não é o real.
#
# refresh-universe roda 30min DEPOIS do purge de propósito — regenera
# product_universe/filter_hierarchy já enxergando o agg pós-poda numa única
# passada. Até 30/07/2026 esse refresh rodava síncrono a cada import e a cada
# purge com linha removida; passou a ser um cron dedicado (item 5 de
# docs/continuar.md) porque cada regeneração custa ~30-36s e PLU/categoria
# novos são raros o bastante para não justificar pagar isso em toda importação.
CRONS=(
	"0 3 * * * cd $BENCH_DIR && PATH=$BUN_DIR:\$PATH $BUN_DIR/bun run cli:purge >> logs/purge.log 2>&1"
	"30 3 * * * cd $BENCH_DIR && PATH=$BUN_DIR:\$PATH $BUN_DIR/bun run cli:refresh-universe >> logs/refresh-universe.log 2>&1"
)

# Remove linhas antigas do bench-gpa e reinstala
(crontab -l 2>/dev/null | grep -v "$BENCH_DIR" || true) > /tmp/crontab-new
for cron in "${CRONS[@]}"; do
  echo "$cron"
done >> /tmp/crontab-new
crontab /tmp/crontab-new
rm /tmp/crontab-new

echo "✅ Crons instaladas:"
crontab -l | grep "$BENCH_DIR"
