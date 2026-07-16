#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

lock_dir=/var/lib/backup/backup.lock
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "backup already running; skipping"
  exit 0
fi

work_dir=/var/lib/backup/staging
rm -rf "$work_dir"
mkdir -p "$work_dir"
cleanup() {
  rm -rf "$work_dir"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
pg_dump \
  --dbname "$BACKUP_DATABASE_URL" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-privileges \
  --file "$work_dir/postgres.dump"

sha256sum "$work_dir/postgres.dump" > "$work_dir/SHA256SUMS"
cat > "$work_dir/metadata.json" <<EOF
{"format":"our-tomorrow-backup","version":1,"startedAt":"$started_at","postgresMajor":16}
EOF

backup_paths=("$work_dir")
if [[ -d /media ]]; then
  backup_paths+=("/media")
fi

restic backup \
  --tag automated \
  --exclude /media/quarantine \
  --exclude /media/exports \
  "${backup_paths[@]}"

restic forget \
  --tag automated \
  --keep-daily "${RESTIC_KEEP_DAILY:-14}" \
  --keep-weekly "${RESTIC_KEEP_WEEKLY:-8}" \
  --keep-monthly "${RESTIC_KEEP_MONTHLY:-12}" \
  --prune

date -u +%Y-%m-%dT%H:%M:%SZ > /var/lib/backup/last-success
echo "backup completed at $(cat /var/lib/backup/last-success)"
