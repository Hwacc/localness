#!/bin/sh
set -e

# The volume may be mounted empty, so the state dirs are created every boot.
mkdir -p /app/runtime/db /app/runtime/uploads

if [ -z "$NUXT_SESSION_PASSWORD" ]; then
  echo "[entrypoint] NUXT_SESSION_PASSWORD is not set — sessions will fail." >&2
  echo "[entrypoint] Pass it in the container env (32+ characters)." >&2
  exit 1
fi

# Schema first, then serve.
echo "[entrypoint] Applying migrations to $DATABASE_URL"
/app/node_modules/.bin/prisma migrate deploy

exec "$@"
