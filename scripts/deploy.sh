#!/bin/bash
set -e
git pull origin main
bun install
bun run build
pm2 reload ecosystem.config.js
echo "Deploy complete!"
