#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

state_dir="${BACKUP_STATE_DIR:-/var/lib/backup}"
media_dir="${BACKUP_MEDIA_DIR:-/media}"
work_dir="$state_dir/staging"
lock_file="$state_dir/backup.lock"
result_file="$state_dir/restic-backup-result.jsonl"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
trigger="${BACKUP_TRIGGER:-automated}"
reason="${BACKUP_REASON:-scheduled}"
release_id="${BACKUP_RELEASE_ID:-unassigned}"
git_commit="${BACKUP_GIT_COMMIT:-${GIT_COMMIT:-unknown}}"
image_tag="${IMAGE_TAG:-unknown}"
host_label="${BACKUP_HOST_LABEL:-our-tomorrow}"
lock_wait_seconds="${BACKUP_LOCK_WAIT_SECONDS:-0}"
backup_id="$(date -u +%Y%m%dT%H%M%SZ)-${HOSTNAME:-container}-$$"

case "$trigger" in
  automated | manual | pre-migration) ;;
  *)
    echo "unsupported BACKUP_TRIGGER: $trigger" >&2
    exit 64
    ;;
esac
[[ "$lock_wait_seconds" =~ ^[0-9]+$ ]] || {
  echo "BACKUP_LOCK_WAIT_SECONDS must be a non-negative integer" >&2
  exit 64
}
case "${RESTIC_CHECK_REPOSITORY:-true}" in
  true | false) ;;
  *)
    echo "RESTIC_CHECK_REPOSITORY must be true or false" >&2
    exit 64
    ;;
esac

mkdir -p "$state_dir"
exec 9>> "$lock_file"
if ! flock -w "$lock_wait_seconds" 9; then
  echo "backup already running; lock owner: $(cat "$lock_file" 2>/dev/null || echo unknown)"
  exit 75
fi
printf 'pid=%s backup_id=%s started_at=%s trigger=%s\n' "$$" "$backup_id" "$started_at" "$trigger" > "$lock_file"

rm -rf "$work_dir"
mkdir -p "$work_dir"

json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

write_failure() {
  local exit_code="$1"
  local failed_at
  local temporary
  failed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  temporary="$(mktemp "$state_dir/.last-failure.XXXXXX")"
  cat > "$temporary" <<EOF
{"format":"our-tomorrow-backup-state","version":1,"status":"failed","backupId":"$(json_escape "$backup_id")","trigger":"$(json_escape "$trigger")","releaseId":"$(json_escape "$release_id")","startedAt":"$started_at","failedAt":"$failed_at","exitCode":$exit_code}
EOF
  mv "$temporary" "$state_dir/last-failure.json"
}

cleanup() {
  local exit_code=$?
  rm -rf "$work_dir"
  rm -f "$result_file"
  if (( exit_code != 0 )); then
    write_failure "$exit_code" || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

database_name="$(psql "$BACKUP_DATABASE_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 --command 'SELECT current_database();')"
database_server_version="$(psql "$BACKUP_DATABASE_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 --command 'SHOW server_version;')"
database_server_version_num="$(psql "$BACKUP_DATABASE_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 --command 'SHOW server_version_num;')"
postgres_major=$((database_server_version_num / 10000))
[[ "$postgres_major" -eq 16 ]] || {
  echo "refusing backup with unsupported PostgreSQL major: $postgres_major" >&2
  exit 65
}

migration_count="$(psql "$BACKUP_DATABASE_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;" 2>/dev/null || printf '0')"
latest_migration="$(psql "$BACKUP_DATABASE_URL" --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT COALESCE(migration_name, '') FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1;" 2>/dev/null || true)"

pg_dump \
  --dbname "$BACKUP_DATABASE_URL" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-privileges \
  --file "$work_dir/postgres.dump"

(
  cd "$work_dir"
  sha256sum postgres.dump > SHA256SUMS
)
dump_sha256="$(awk '{print $1}' "$work_dir/SHA256SUMS")"
dump_bytes="$(stat -c %s "$work_dir/postgres.dump")"

media_file_count=0
media_bytes=0
if [[ -d "$media_dir" ]]; then
  media_file_count="$(find "$media_dir" \( -path "$media_dir/quarantine" -o -path "$media_dir/exports" -o -path "$media_dir/.ops" \) -prune -o -type f -print | wc -l | tr -d ' ')"
  media_bytes="$(find "$media_dir" \( -path "$media_dir/quarantine" -o -path "$media_dir/exports" -o -path "$media_dir/.ops" \) -prune -o -type f -exec stat -c %s {} \; | awk '{ total += $1 } END { print total + 0 }')"
fi

prepared_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$work_dir/metadata.json" <<EOF
{
  "format": "our-tomorrow-backup",
  "version": 2,
  "backupId": "$(json_escape "$backup_id")",
  "trigger": "$(json_escape "$trigger")",
  "reason": "$(json_escape "$reason")",
  "releaseId": "$(json_escape "$release_id")",
  "startedAt": "$started_at",
  "preparedAt": "$prepared_at",
  "application": {
    "gitCommit": "$(json_escape "$git_commit")",
    "imageTag": "$(json_escape "$image_tag")"
  },
  "database": {
    "name": "$(json_escape "$database_name")",
    "postgresMajor": $postgres_major,
    "serverVersion": "$(json_escape "$database_server_version")",
    "dumpBytes": $dump_bytes,
    "dumpSha256": "$dump_sha256",
    "completedPrismaMigrations": $migration_count,
    "latestPrismaMigration": "$(json_escape "$latest_migration")"
  },
  "media": {
    "fileCount": $media_file_count,
    "bytes": $media_bytes,
    "excluded": ["quarantine", "exports", ".ops"]
  }
}
EOF
jq -e '.format == "our-tomorrow-backup" and .version == 2' "$work_dir/metadata.json" >/dev/null

backup_paths=("$work_dir")
if [[ -d "$media_dir" ]]; then
  backup_paths+=("$media_dir")
fi

restic backup \
  --json \
  --host "$host_label" \
  --tag our-tomorrow \
  --tag "$trigger" \
  --exclude "$media_dir/quarantine" \
  --exclude "$media_dir/exports" \
  --exclude "$media_dir/.ops" \
  "${backup_paths[@]}" > "$result_file"

snapshot_id="$(jq -r 'select(.message_type == "summary") | .snapshot_id // empty' "$result_file" | tail -n 1)"
[[ "$snapshot_id" =~ ^[a-f0-9]{64}$ ]] || {
  echo "restic did not return a valid snapshot ID" >&2
  exit 66
}
restic snapshots "$snapshot_id" --json | jq -e --arg id "$snapshot_id" 'length == 1 and .[0].id == $id' >/dev/null

if [[ "${RESTIC_CHECK_REPOSITORY:-true}" == "true" ]]; then
  check_args=(check)
  if [[ -n "${RESTIC_CHECK_READ_DATA_SUBSET:-}" ]]; then
    check_args+=(--read-data-subset "$RESTIC_CHECK_READ_DATA_SUBSET")
  fi
  restic "${check_args[@]}"
fi

restic forget \
  --tag our-tomorrow \
  --group-by host,paths \
  --keep-daily "${RESTIC_KEEP_DAILY:-14}" \
  --keep-weekly "${RESTIC_KEEP_WEEKLY:-8}" \
  --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}" \
  --prune

completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
success_tmp="$(mktemp "$state_dir/.last-success.XXXXXX")"
cat > "$success_tmp" <<EOF
{"format":"our-tomorrow-backup-state","version":1,"status":"succeeded","backupId":"$(json_escape "$backup_id")","snapshotId":"$snapshot_id","trigger":"$(json_escape "$trigger")","reason":"$(json_escape "$reason")","releaseId":"$(json_escape "$release_id")","gitCommit":"$(json_escape "$git_commit")","imageTag":"$(json_escape "$image_tag")","startedAt":"$started_at","completedAt":"$completed_at","repositoryChecked":${RESTIC_CHECK_REPOSITORY:-true}}
EOF
jq -e '.status == "succeeded" and (.snapshotId | length == 64)' "$success_tmp" >/dev/null
mv "$success_tmp" "$state_dir/last-success.json"

timestamp_tmp="$(mktemp "$state_dir/.last-success-time.XXXXXX")"
printf '%s\n' "$completed_at" > "$timestamp_tmp"
mv "$timestamp_tmp" "$state_dir/last-success"

echo "backup completed at $completed_at (snapshot $snapshot_id)"
