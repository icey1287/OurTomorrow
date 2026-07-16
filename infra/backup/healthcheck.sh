#!/usr/bin/env sh
set -eu

last_success=/var/lib/backup/last-success
max_age="${BACKUP_MAX_AGE_SECONDS:-129600}"

test -f "$last_success"
last_epoch="$(stat -c %Y "$last_success")"
now_epoch="$(date +%s)"
test "$((now_epoch - last_epoch))" -le "$max_age"
