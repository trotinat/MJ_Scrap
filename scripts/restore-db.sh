#!/bin/sh
# Restores a dump produced by backup-db.sh into the database designated by the
# libpq variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE). Existing objects
# are dropped and recreated. The dump is checked before anything is touched.
set -eu

FILE="${1:?Usage : restore-db.sh <fichier.dump>}"
[ -f "$FILE" ] || { echo "Fichier introuvable : $FILE" >&2; exit 1; }

pg_restore --list "$FILE" > /dev/null
echo "[restore] archive valide : $FILE"
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname="${PGDATABASE}" "$FILE"
echo "[restore] restauration terminée"
psql -Atc "select 'offres: ' || count(*) from product_offers" || true
psql -Atc "select 'relevés: ' || count(*) from price_history" || true
