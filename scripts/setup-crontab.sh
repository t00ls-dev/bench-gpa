#!/usr/bin/env bash
set -euo pipefail
(crontab -l 2>/dev/null || true; echo "0 * * * * cd /root/bench-gpa && PATH=/root/.bun/bin:\$PATH /root/.bun/bin/bun run cli:watch >> logs/cron.log 2>&1"; echo "0 * * * * cd /root/bench-gpa && PATH=/root/.bun/bin:\$PATH /root/.bun/bin/bun run cli:review >> logs/review.log 2>&1") | sort -u | crontab -
echo "Crontab atualizado:"
crontab -l
