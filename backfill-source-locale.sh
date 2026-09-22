#!/bin/sh
# Backfill every key's original text into its project's source language, keeping
# a consistent copy of the database first.
#
# Run this after the release that made the source language real, and BEFORE the
# one that drops `I18nKey.origin` — the backfill reads that column.
#
#   ./backfill-source-locale.sh           # copy nothing, report only (safe)
#   ./backfill-source-locale.sh --apply   # copy the DB, backfill, re-check
#
# Run from this directory; sudo is for docker. Idempotent: a database that has
# already been backfilled, or has already lost the column, is a no-op.
set -eu

cd "$(dirname "$0")"

SERVICE=localness
# The compose directory is often a plain file drop rather than a checkout, so the
# path can be pointed elsewhere when the two files were placed differently.
SCRIPT="${LOCALNESS_BACKFILL_SCRIPT:-scripts/migrate-origin-to-source-locale.ts}"
# Piped into the container rather than baked into the image: the release that
# introduced the source language predates this script, and this must run before
# the release that drops the column — so it cannot wait for a new image.
# `/app/runtime` is the writable volume; `/app/shared` and `/app/node_modules`
# are what the script imports.
IN_CONTAINER=/app/runtime/backfill-source-locale.ts
BACKUP_DIR="${LOCALNESS_BACKUP_DIR:-./backups}"

apply=false
for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: $0 [--apply]" >&2
      exit 2
      ;;
  esac
done

if [ ! -f docker-compose.yml ]; then
  echo "docker-compose.yml not found in $(pwd)" >&2
  exit 1
fi
if [ ! -f "$SCRIPT" ]; then
  echo "$SCRIPT not found." >&2
  echo "The backfill itself runs inside the container; this file only carries it" >&2
  echo "there. Put it next to this script, keeping the path it has in the" >&2
  echo "repository (a directory named scripts/), or point at it with" >&2
  echo "LOCALNESS_BACKFILL_SCRIPT=/path/to/migrate-origin-to-source-locale.ts." >&2
  exit 1
fi

docker="sudo docker compose"
if [ -z "$($docker ps -q "$SERVICE")" ]; then
  echo "Container '$SERVICE' is not running. Deploy it first with ./update.sh <tag>." >&2
  exit 1
fi

# PATH inside the image includes /app/node_modules/.bin (see the Dockerfile), so
# `tsx` is callable by name.
$docker exec -T "$SERVICE" sh -c "cat > $IN_CONTAINER" < "$SCRIPT"
cleanup() {
  $docker exec -T "$SERVICE" rm -f "$IN_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

run() {
  $docker exec -T "$SERVICE" tsx "$IN_CONTAINER" "$@"
}

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
report="$BACKUP_DIR/source-locale-$stamp.txt"

echo "==> Reporting (writes nothing)"
run | tee "$report"

if [ "$apply" != true ]; then
  echo
  echo "Dry run — nothing written. The report is also at $report."
  echo "Re-run with --apply to backfill; a database copy is taken first."
  exit 0
fi

# A copy of the database as it is right now, inside the volume first (VACUUM INTO
# is consistent while the app keeps writing), then out to the host — the volume
# is what a bad deploy rewrites.
in_container_backup="/app/runtime/db/pre-backfill-$stamp.db"
host_backup="$BACKUP_DIR/pre-backfill-$stamp.db"

echo
echo "==> Copying the database"
run --backup "$in_container_backup"
$docker cp "$SERVICE:$in_container_backup" "$host_backup"
$docker exec -T "$SERVICE" rm -f "$in_container_backup"

echo
echo "==> Backfilling"
apply_report="$BACKUP_DIR/source-locale-$stamp-apply.txt"
if ! run --apply >"$apply_report" 2>&1; then
  cat "$apply_report"
  echo >&2
  echo "The check is not clean — read it above, and do NOT deploy the release" >&2
  echo "that drops I18nKey.origin." >&2
  exit 1
fi
cat "$apply_report"
cat "$apply_report" >>"$report"

echo
echo "Backfilled. Read $report and confirm the two check lines are 0, then deploy"
echo "the release that drops I18nKey.origin."
echo "Roll back that deploy with the copy at $host_backup"
