#!/usr/bin/env sh
set -eu

state_dir="${BACKUP_STATE_DIR:-/var/lib/backup}"
last_success="$state_dir/last-success"
last_success_json="$state_dir/last-success.json"
max_age="${BACKUP_MAX_AGE_SECONDS:-129600}"

test -f "$last_success"
test -f "$last_success_json"
jq -e '
  .format == "our-tomorrow-backup-state"
  and .status == "succeeded"
  and (.snapshotId | type == "string" and length == 64)
' "$last_success_json" >/dev/null
if [ "${RESTIC_CHECK_REPOSITORY:-true}" = "true" ]; then
  jq -e '.repositoryChecked == true' "$last_success_json" >/dev/null
fi

last_epoch="$(stat -c %Y "$last_success")"
now_epoch="$(date +%s)"
age="$((now_epoch - last_epoch))"
test "$age" -ge 0
test "$age" -le "$max_age"
