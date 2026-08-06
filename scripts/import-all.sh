#!/usr/bin/env bash
set -euo pipefail

# Imports every XLSX in a folder in ascending date order
# Usage: bash scripts/import-all.sh data/2026-06 [--user-id UUID]

DIR="${1:-data/2026-06}"
shift 2>/dev/null || true

if [ ! -d "$DIR" ]; then
  echo "Folder not found: $DIR"
  exit 1
fi

for f in "$DIR"/*.xlsx; do
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo ">>> Importing $(basename "$f")..."
  echo "═══════════════════════════════════════════════════"
  bun run cli:import "$f" "$@"
done

echo ""
echo "All files imported."
