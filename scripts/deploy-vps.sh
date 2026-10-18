#!/usr/bin/env bash
# Run on the VPS after the workflow has checked out the selected GitHub ref.
# Keeps PostgreSQL in the named pgdata volume and backs it up before updates.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.tailscale.yml)
exec 9>"$ROOT/.git/deploy.lock"
if ! flock -n 9; then
  echo "Another Marjane deploy is already running." >&2
  exit 1
fi

echo "Starting or updating PostgreSQL and the backup service..."
"${COMPOSE[@]}" up -d db backup

echo "Waiting for PostgreSQL..."
for attempt in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T db sh -ec 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "PostgreSQL did not become ready." >&2
    exit 1
  fi
  sleep 2
done

if [ -s "$ROOT/.env" ]; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  echo "Writing pre-deploy database backup..."
  "${COMPOSE[@]}" exec -T backup /bin/sh /scripts/backup-db.sh
  latest="$(find "$ROOT/backups/daily" -maxdepth 1 -type f -name 'mdw-*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
  if [ -n "$latest" ]; then
    mkdir -p "$ROOT/backups/predeploy"
    cp -- "$latest" "$ROOT/backups/predeploy/mdw-$stamp.dump"
    chmod 600 "$ROOT/backups/predeploy/mdw-$stamp.dump"
    find "$ROOT/backups/predeploy" -type f -name 'mdw-*.dump' -mtime +30 -delete
  fi
fi

echo "Building web, worker, and migration images..."
"${COMPOSE[@]}" build web worker migrate bot

echo "Applying database migrations..."
"${COMPOSE[@]}" run --rm migrate node dist/cli.js migrate

echo "Starting the updated app..."
"${COMPOSE[@]}" up -d --remove-orphans

echo "Checking app health..."
for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:3000/api/health >/dev/null; then
    echo "Marjane deployment is healthy."
    exit 0
  fi
  sleep 2
done

echo "The app did not become healthy. Recent service status:" >&2
"${COMPOSE[@]}" ps >&2
exit 1
