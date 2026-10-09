#!/usr/bin/env bash
# Restores a backup on the VPS host:
#   ./scripts/restore.sh backups/daily/mdw-20261009T023000Z.dump
# Stops the web app and the worker during the restore, then restarts them.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:?Usage : ./scripts/restore.sh backups/daily/<fichier>.dump}"
case "$FILE" in
  backups/*) ;;
  *) echo "Le fichier doit se trouver dans ./backups (monté dans le conteneur backup)" >&2; exit 1 ;;
esac
[ -f "$FILE" ] || { echo "Fichier introuvable : $FILE" >&2; exit 1; }

read -r -p "La base actuelle va être remplacée par $FILE. Continuer ? [oui/N] " answer
[ "$answer" = "oui" ] || { echo "Annulé."; exit 1; }

docker compose stop web worker
trap 'docker compose start web worker' EXIT
docker compose exec -T backup /bin/sh /scripts/restore-db.sh "/${FILE}"
echo "Restauration terminée ; redémarrage du web et du worker."
