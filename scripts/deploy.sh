#!/bin/bash
set -e
git pull origin feat/selfhost
bun install
bun run build
pm2 reload ecosystem.config.js
echo "Deploy complete!"
