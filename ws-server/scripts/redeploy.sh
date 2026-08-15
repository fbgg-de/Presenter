#!/usr/bin/env bash
#
# redeploy.sh — replace a deployed Presenter WS relay with a freshly built zip.
#
# Put this next to ws-server-deploy.zip in the folder that holds the running
# deployment (the one containing docker-compose.yml), then:
#
#   sudo ./redeploy.sh
#   sudo ./redeploy.sh -y
#
# docker-compose.yml is deliberately never touched.

set -euo pipefail

cd "$(dirname "$0")"

ZIP="ws-server-deploy.zip"
COMPOSE_FILE="docker-compose.yml"

# Exactly what the zip provides, and therefore what is cleared out first.
# Anything else in this folder is left alone.
STALE="dist node_modules Dockerfile package.json"

# Run privileged commands through sudo unless already root.
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  echo "ERROR: not running as root and sudo is not available." >&2
  exit 1
fi

# Prefer standalone docker-compose, then the Compose plugin.
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
elif docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "ERROR: neither 'docker-compose' nor 'docker compose' is available." >&2
  exit 1
fi

# Verify everything before destroying the current deployment.
if [ ! -f "$ZIP" ]; then
  echo "ERROR: $ZIP not found in $(pwd)." >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: $COMPOSE_FILE not found in $(pwd)." >&2
  echo "       Copy it from the repo and set BACKEND_URL." >&2
  exit 1
fi

# Synology DSM commonly has 7z but not unzip.
if command -v unzip >/dev/null 2>&1; then
  EXTRACTOR="unzip"
elif command -v 7z >/dev/null 2>&1; then
  EXTRACTOR="7z"
elif command -v 7za >/dev/null 2>&1; then
  EXTRACTOR="7za"
else
  echo "ERROR: neither 'unzip' nor '7z'/'7za' is available." >&2
  echo "       Check whether /bin/7z exists." >&2
  exit 1
fi

case "${1:-}" in
  -y | --yes)
    ;;
  *)
    if [ -t 0 ]; then
      echo "About to replace the deployment in $(pwd):"

      for item in $STALE; do
        if [ -e "$item" ]; then
          echo "  remove  $item"
        fi
      done

      echo "  unpack  $ZIP using $EXTRACTOR"
      echo "  keep    $COMPOSE_FILE"

      printf 'Continue? [y/N] '
      read -r reply

      case "$reply" in
        y | Y | yes | YES)
          ;;
        *)
          echo "Aborted."
          exit 1
          ;;
      esac
    fi
    ;;
esac

echo "==> Stopping the stack"
$SUDO "${COMPOSE[@]}" down

echo "==> Removing the artefacts the zip replaces"
for item in $STALE; do
  $SUDO rm -rf -- "$item"
done

echo "==> Unpacking $ZIP using $EXTRACTOR"
case "$EXTRACTOR" in
  unzip)
    $SUDO unzip -oq "$ZIP"
    ;;
  7z | 7za)
    $SUDO "$EXTRACTOR" x -y "$ZIP"
    ;;
esac

echo "==> Rebuilding the image"
$SUDO "${COMPOSE[@]}" build --no-cache

echo "==> Starting"
$SUDO "${COMPOSE[@]}" up -d

echo
echo "==> Startup log"
sleep 2
$SUDO "${COMPOSE[@]}" logs --tail=20

echo
echo "Done."
