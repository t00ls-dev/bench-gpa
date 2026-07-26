#!/bin/bash
# setup-crons.sh — Instala/atualiza as crons do Bench GPA
# Uso: bash scripts/setup-crons.sh

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
# em KNOWN_JOBS (src/lib/admin.functions.ts), senão o painel admin não monitora.
CRONS=(
	"0 3 * * * cd $BENCH_DIR && PATH=$BUN_DIR:\$PATH $BUN_DIR/bun run cli:purge >> logs/purge.log 2>&1"
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
