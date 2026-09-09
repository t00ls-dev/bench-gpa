#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(dirname "$SCRIPT_DIR")

NODE_ENV=production PORT="${PORT:-3000}" exec node \
  --env-file="$APP_DIR/.env" \
  "$APP_DIR/.output/server/index.mjs"
