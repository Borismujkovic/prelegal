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

# Which host port did we actually get? Port 8000 is only the default: both the
# shell and .env can move it via PRELEGAL_PORT, and compose applies its own
# precedence between the two. Asking compose what it published beats
# re-deriving that here — and it is the difference between polling our own
# container and polling whatever else happens to hold 8000.
host_port="$(docker compose port prelegal 8000 2>/dev/null | tail -n 1 | sed 's/.*://')"
base_url="http://localhost:${host_port:-8000}"

printf 'Waiting for %s ' "$base_url"
for _ in $(seq 1 60); do
  if curl -fsS "$base_url/api/health" >/dev/null 2>&1; then
    echo
    echo "Prelegal is up:  $base_url"
    echo "API docs:        $base_url/docs"
    exit 0
  fi
  printf '.'
  sleep 1
done

echo
echo "Timed out waiting for the API. Recent logs:" >&2
docker compose logs --tail=40 >&2
exit 1
