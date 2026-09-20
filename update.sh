#!/bin/sh
# Pull a Hub image and recreate the container. Does not pass -v (the volume
# holds SQLite and uploads). Run from this directory; sudo is for docker.
#
#   ./update.sh           # huacc/localness:latest
#   ./update.sh 0.1.2
#   ./update.sh v0.1.2
set -eu

cd "$(dirname "$0")"

if [ ! -f docker-compose.yml ]; then
  echo "docker-compose.yml not found in $(pwd)" >&2
  exit 1
fi
if [ ! -f .env.docker ]; then
  echo ".env.docker is missing — copy .env.docker.example and fill it in." >&2
  exit 1
fi

IMAGE_REPO="${LOCALNESS_IMAGE_REPO:-huacc/localness}"
if [ "${1:-}" = "" ]; then
  tag=latest
else
  tag="${1#v}"
fi

export LOCALNESS_IMAGE="${IMAGE_REPO}:${tag}"
port="${LOCALNESS_PORT:-13000}"

echo "Updating to ${LOCALNESS_IMAGE} (data volume is kept)"

# Intranet hosts often time out on registry-1.docker.io. Fail the script
# before `up` so a pull miss does not recreate the container on a stale tag.
attempt=1
while :; do
  if sudo docker compose pull; then
    break
  fi
  if [ "$attempt" -ge "${LOCALNESS_PULL_RETRIES:-3}" ]; then
    echo "Pull failed: cannot reach Docker Hub for ${LOCALNESS_IMAGE}." >&2
    echo "The running container was not changed. Retry later, or configure a registry mirror on the host." >&2
    exit 1
  fi
  echo "Pull timed out (attempt ${attempt}/${LOCALNESS_PULL_RETRIES:-3}), retrying in 5s..." >&2
  attempt=$((attempt + 1))
  sleep 5
done

sudo docker compose up -d

# `up -d` returns as soon as the container exists. The entrypoint still has
# to migrate, then Nitro has to listen — compose start_period is 40s for this.
url="http://127.0.0.1:${port}/api/health"
deadline=$(( $(date +%s) + ${LOCALNESS_HEALTH_WAIT:-90} ))
body=""
while :; do
  if body=$(curl -fsS -m 2 "$url" 2>/dev/null); then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Health: failed (no response from ${url} within ${LOCALNESS_HEALTH_WAIT:-90}s)" >&2
    sudo docker compose ps >&2
    sudo docker compose logs --tail 80 localness >&2
    exit 1
  fi
  sleep 2
done

sudo docker compose ps
echo "Health: ${body}"
