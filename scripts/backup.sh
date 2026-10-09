#!/usr/bin/env bash
# Manual backup from the VPS host (the "backup" service also runs one daily).
#   ./scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T backup /bin/sh /scripts/backup-db.sh
ls -lh backups/daily | tail -5
