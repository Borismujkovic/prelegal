#!/usr/bin/env bash
#
# Start Prelegal. Builds the image if needed, then waits until the API answers.
#
# The database is recreated from scratch on every start — nothing entered in a
# previous run survives this.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building and starting Prelegal…"
docker compose up --build -d

printf 'Waiting for http://localhost:8000 '
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
    echo
    echo "Prelegal is up:  http://localhost:8000"
    echo "API docs:        http://localhost:8000/docs"
    exit 0
  fi
  printf '.'
  sleep 1
done

echo
echo "Timed out waiting for the API. Recent logs:" >&2
docker compose logs --tail=40 >&2
exit 1
