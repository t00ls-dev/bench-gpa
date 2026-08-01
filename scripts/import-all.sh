#!/usr/bin/env bash
set -euo pipefail

# Importa todos os XLSX de uma pasta em ordem crescente de data
# Uso: bash scripts/import-all.sh data/2026-06 [--user-id UUID]

DIR="${1:-data/2026-06}"
shift 2>/dev/null || true

if [ ! -d "$DIR" ]; then
  echo "Pasta não encontrada: $DIR"
  exit 1
fi

for f in "$DIR"/*.xlsx; do
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo ">>> Importando $(basename "$f")..."
  echo "═══════════════════════════════════════════════════"
  bun run cli:import "$f" "$@"
done

echo ""
echo "Todos os arquivos importados."
