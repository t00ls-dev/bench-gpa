#!/bin/bash
# setup-crons.sh — Instala/atualiza as crons do Bench GPA
# Uso: bash scripts/setup-crons.sh

set -euo pipefail

BENCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN_DIR="$(dirname "$(command -v bun 2>/dev/null)" 2>/dev/null || echo /root/.bun/bin)"

CRONS=(
	"0 3 * * * cd $BENCH_DIR && PATH=$BUN_DIR:\$PATH $BUN_DIR/bun run cli:purge >> logs/purge.log 2>&1"
  # Import: arquivo fica disponível ~9h e é enviado manualmente em horário
  # variável — checa a cada 3h (10h–22h). O import-watch é idempotente (pula
  # dias já importados), então rodar várias vezes é seguro e no-op sem novidade.
  "0 10-22/3 * * * cd $BENCH_DIR && PATH=$BUN_DIR:\$PATH $BUN_DIR/bun run cli:watch >> logs/cron.log 2>&1"
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
