#!/usr/bin/env bash
set -Eeuo pipefail

if (( $# > 0 )); then
  exec "$@"
fi

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

export RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-/var/lib/backup/cache}"
mkdir -p "$RESTIC_CACHE_DIR"

if ! restic cat config >/dev/null 2>&1; then
  restic init
fi

/usr/local/bin/backup.sh
exec crond -f -l 2
