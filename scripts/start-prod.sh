#!/bin/bash
set -a
source "$(dirname "$0")/../.env"
set +a

NODE_ENV=production PORT=3000 exec node "$(dirname "$0")/../.output/server/index.mjs"
