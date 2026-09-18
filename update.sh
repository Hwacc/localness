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
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
echo "Health: $(curl -sS -m 8 "http://127.0.0.1:${port}/api/health" || echo failed)"
