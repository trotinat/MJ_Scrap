#!/bin/sh
# Dumps the database (custom format, compressed) and applies the retention policy:
#   - daily dumps kept KEEP_DAILY days (default 14)
#   - the Sunday dump is also copied to weekly/ and kept KEEP_WEEKLY weeks (default 8)
# Uses the standard libpq variables PGHOST, PGUSER, PGPASSWORD, PGDATABASE.
# Runs inside the "backup" container (cron, 02:30 UTC) or by hand.
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
TMP="$BACKUP_DIR/daily/.mdw-$STAMP.dump.partial"
OUT="$BACKUP_DIR/daily/mdw-$STAMP.dump"

pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$TMP"
# Verify the archive is readable before publishing it.
pg_restore --list "$TMP" > /dev/null
mv "$TMP" "$OUT"
echo "[backup] $(date -u +%FT%TZ) écrit $OUT ($(du -h "$OUT" | cut -f1))"

if [ "$(date -u +%u)" = "7" ]; then
  cp "$OUT" "$BACKUP_DIR/weekly/"
  echo "[backup] copie hebdomadaire conservée"
fi

find "$BACKUP_DIR/daily" -name 'mdw-*.dump' -type f -mtime +"$KEEP_DAILY" -print -delete
find "$BACKUP_DIR/weekly" -name 'mdw-*.dump' -type f -mtime +"$((KEEP_WEEKLY * 7))" -print -delete
