#!/bin/bash
# setup-crons.sh: installs/updates Bench GPA's crons
# Usage: bash scripts/setup-crons.sh
#
# WARNING: DO NOT RUN THIS IN PRODUCTION. There, HestiaCP owns the crontab:
# the source of truth is /usr/local/hestia/data/users/admin/cron.conf, and
# the raw crontab is generated from it. This script writes directly with
# `crontab`, so it would only touch the generated side, which Hestia
# overwrites on its next change, silently undoing the modification.
#
# In production, use Hestia's own tools:
#   sudo /usr/local/hestia/bin/v-add-cron-job admin '0' '3' '*' '*' '*' '<cmd>'
#   sudo /usr/local/hestia/bin/v-change-cron-job / v-delete-cron-job
#
# This script is for a standalone environment (dev, or a VPS with no panel).

set -euo pipefail

BENCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN_DIR="$(dirname "$(command -v bun 2>/dev/null)" 2>/dev/null || echo /root/.bun/bin)"

# Importing has NO cron. It happens through the app's /upload screen, which
# is the normal path, or on demand on the server with
# `bun run cli:import <file>` (a single file) or `bun run cli:watch`
# (scans the inbox in data/).
#
# The cli:watch cron existed because spreadsheets arrived via git and
# someone had to react to them; it was turned off on 2026-07-26 along with
# data leaving version control. The scripts remain available for manual
# use; if automating this ever makes sense again, reintroduce the line
# here AND the job in KNOWN_JOBS (src/lib/admin-system.functions.ts),
# otherwise the admin panel doesn't monitor it.
#
# The "0 3"/"30 3" below are the real source of the purge and
# refresh-universe schedules. TS doesn't read bash, so the admin panel
# shows a separate piece of text (PURGE_CRON_LABEL/REFRESH_UNIVERSE_CRON_LABEL
# in src/lib/retention.ts) describing the same schedule. Changing it here
# (or in Hestia's v-add-cron-job in production) without changing it there
# leaves the panel showing a schedule that isn't the real one.
#
# refresh-universe deliberately runs 30min AFTER the purge: it regenerates
# product_universe/filter_hierarchy already seeing the post-purge agg in a
# single pass. Until 07/30/2026 this refresh ran synchronously on every
# import and every purge that removed a row; it became a dedicated cron
# (docs/continuar.md item 5) because each regeneration costs ~30-36s and
# new PLUs/categories are rare enough not to justify paying that cost on
# every import.
CRONS=(
	"0 3 * * * cd $BENCH_DIR && PATH=$BUN_DIR:\$PATH $BUN_DIR/bun run cli:purge >> logs/purge.log 2>&1"
	"30 3 * * * cd $BENCH_DIR && PATH=$BUN_DIR:\$PATH $BUN_DIR/bun run cli:refresh-universe >> logs/refresh-universe.log 2>&1"
)

# Removes old bench-gpa lines and reinstalls
(crontab -l 2>/dev/null | grep -v "$BENCH_DIR" || true) > /tmp/crontab-new
for cron in "${CRONS[@]}"; do
  echo "$cron"
done >> /tmp/crontab-new
crontab /tmp/crontab-new
rm /tmp/crontab-new

echo "Crons instaladas:"
crontab -l | grep "$BENCH_DIR"
