#!/usr/bin/env bash
#
# Stop Prelegal and remove the container, taking the SQLite database with it.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Stopping Prelegal…"
docker compose down --remove-orphans
echo "Stopped."
