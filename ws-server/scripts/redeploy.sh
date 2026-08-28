#!/usr/bin/env bash
#
# redeploy.sh — replace a deployed Presenter WS relay with a freshly built zip.
#
# Put this next to the relay zip in the folder that holds the running deployment (the
# one containing docker-compose.yml), then:
#
#   sudo ./redeploy.sh
#   sudo ./redeploy.sh -y
#
# docker-compose.yml is deliberately never touched.
#
# The zip also contains a copy of this script, so an upgrade brings its own deploy logic
# with it — see the re-exec below for why that is safe.

set -euo pipefail

cd "$(dirname "$0")"

# ── Run from a throwaway copy of ourselves ────────────────────────────────────
# The zip ships redeploy.sh, so unpacking it rewrites this very file. bash reads a script
# lazily as it executes, so overwriting the running file mid-run makes it jump into
# whatever bytes landed at the current offset. Copying to a temp file first and re-execing
# from there means the file being replaced is no longer the one being read.
if [ -z "${REDEPLOY_REEXEC:-}" ]; then
  self_copy="$(mktemp)"
  cp "$0" "$self_copy"
  trap 'rm -f "$self_copy"' EXIT
  REDEPLOY_REEXEC=1 REDEPLOY_DIR="$(pwd)" exec bash "$self_copy" "$@"
fi

# The re-exec loses $0's directory, so the parent passes it explicitly.
cd "${REDEPLOY_DIR:-.}"

COMPOSE_FILE="docker-compose.yml"

# Exactly what the zip provides, and therefore what is cleared out first. Anything else in
# this folder is left alone. node_modules is still listed although the relay is now a
# single bundled file: an older deployment has one, and it must not be left behind.
#
# redeploy.sh is deliberately NOT listed — it is replaced by the unzip, not deleted first,
# so a failed run still leaves a working script behind.
STALE="dist node_modules Dockerfile package.json"

# Locally built zips are ws-server-deploy.zip; the one attached to a GitHub release carries
# the relay version (ws-server-1.2.0.zip) so releases can be told apart. Accept either, and
# refuse to guess when several are lying around rather than deploying an arbitrary one.
find_zip() {
  if [ -f "ws-server-deploy.zip" ]; then
    printf '%s' "ws-server-deploy.zip"
    return 0
  fi

  # Function-local positional parameters — the caller's "$@" is untouched.
  set -- ws-server-*.zip

  if [ "$#" -eq 1 ] && [ -f "$1" ]; then
    printf '%s' "$1"
    return 0
  fi

  return 1
}

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
if ! ZIP="$(find_zip)"; then
  echo "ERROR: no relay zip found in $(pwd)." >&2
  echo "       Expected ws-server-deploy.zip, or exactly one ws-server-*.zip." >&2
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
