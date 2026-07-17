#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/infra/scripts"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/our-tomorrow-infra-tests.XXXXXX")"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

PRODUCTION_ENV="$TMP_DIR/production.env"
cat > "$PRODUCTION_ENV" <<'EOF'
ACCESS_BOUNDARY=upstream-access-proxy
PRIVATE_ACCESS_ACKNOWLEDGED=true
CADDY_BIND_ADDRESS=127.0.0.1
APP_SITE_ADDRESS=:80
NODE_ENV=production
PUBLIC_APP_URL=https://our-tomorrow.private.example
WEB_ORIGIN=https://our-tomorrow.private.example
HTTP_PORT=18080
HTTPS_PORT=18443
IMAGE_TAG=stage5-test-abcdef123456
DEPLOY_IMAGE_MODE=build
DEPLOY_HEALTH_TIMEOUT_SECONDS=60
DEPLOY_RECORD_DIR=infra/releases
POSTGRES_DB=our_tomorrow
POSTGRES_USER=our_tomorrow
POSTGRES_PASSWORD=unit-test-database-secret-123456
POSTGRES_PORT=55439
DATABASE_URL=postgresql://our_tomorrow:unit-test-database-secret-123456@postgres:5432/our_tomorrow?schema=public
BACKUP_DATABASE_URL=postgresql://our_tomorrow:unit-test-database-secret-123456@postgres:5432/our_tomorrow
RESTIC_REPOSITORY=s3:s3.example.invalid/our-tomorrow-test
BACKUP_ENCRYPTION_KEY=unit-test-restic-secret-1234567890
BACKUP_OFFSITE_ACKNOWLEDGED=true
BACKUP_HOST_LABEL=our-tomorrow-test
RESTIC_KEEP_DAILY=14
RESTIC_KEEP_WEEKLY=8
RESTIC_KEEP_MONTHLY=12
BACKUP_MAX_AGE_SECONDS=129600
RESTIC_CHECK_REPOSITORY=true
RESTIC_CHECK_READ_DATA_SUBSET=
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=test
TZ=Asia/Shanghai
EOF

RESTORE_ENV="$TMP_DIR/restore.env"
cat > "$RESTORE_ENV" <<'EOF'
ACCESS_BOUNDARY=private-interface
PRIVATE_ACCESS_ACKNOWLEDGED=false
CADDY_BIND_ADDRESS=127.0.0.1
APP_SITE_ADDRESS=http://localhost
NODE_ENV=production
PUBLIC_APP_URL=http://127.0.0.1:18081
WEB_ORIGIN=http://127.0.0.1:18081
HTTP_PORT=18081
HTTPS_PORT=18444
IMAGE_TAG=stage5-test-abcdef123456
POSTGRES_DB=our_tomorrow
POSTGRES_USER=our_tomorrow
POSTGRES_PASSWORD=restore-test-database-secret-123456
POSTGRES_PORT=55440
DATABASE_URL=postgresql://our_tomorrow:restore-test-database-secret-123456@postgres:5432/our_tomorrow?schema=public
BACKUP_DATABASE_URL=postgresql://our_tomorrow:restore-test-database-secret-123456@postgres:5432/our_tomorrow
RESTIC_REPOSITORY=s3:s3.example.invalid/our-tomorrow-test
BACKUP_ENCRYPTION_KEY=restore-test-restic-secret-1234567890
BACKUP_HOST_LABEL=our-tomorrow-test
RESTIC_CHECK_REPOSITORY=true
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=test
TZ=Asia/Shanghai
EOF

"$SCRIPTS_DIR/check-shell.sh"
"$SCRIPTS_DIR/preflight.sh" --env-file "$PRODUCTION_ENV" --dry-run
"$SCRIPTS_DIR/backup-now.sh" \
  --env-file "$PRODUCTION_ENV" \
  --release-id test-release-001 \
  --reason test-only \
  --skip-preflight \
  --dry-run
"$SCRIPTS_DIR/deploy.sh" \
  --env-file "$PRODUCTION_ENV" \
  --image-tag stage5-test-abcdef123456 \
  --release-id test-release-001 \
  --dry-run
"$SCRIPTS_DIR/restore-drill.sh" \
  --env-file "$RESTORE_ENV" \
  --snapshot aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --project our-tomorrow-drill-script-test \
  --dry-run

FAKE_BIN="$TMP_DIR/fake-bin"
BACKUP_STATE="$TMP_DIR/backup-state"
BACKUP_MEDIA="$TMP_DIR/backup-media"
mkdir -p "$FAKE_BIN" "$BACKUP_STATE" "$BACKUP_MEDIA/ready"
printf 'fixture-media\n' > "$BACKUP_MEDIA/ready/image.webp"

cat > "$FAKE_BIN/flock" <<'EOF'
#!/usr/bin/env sh
exit 0
EOF
cat > "$FAKE_BIN/psql" <<'EOF'
#!/usr/bin/env sh
case "$*" in
  *current_database*) printf 'our_tomorrow\n' ;;
  *server_version_num*) printf '160010\n' ;;
  *server_version*) printf '16.10\n' ;;
  *'count(*)'*) printf '7\n' ;;
  *migration_name*) printf '20260717000000_test\n' ;;
  *) exit 1 ;;
esac
EOF
cat > "$FAKE_BIN/pg_dump" <<'EOF'
#!/usr/bin/env sh
output=
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--file" ]; then
    output="$2"
    shift 2
  else
    shift
  fi
done
test -n "$output"
printf 'fake custom-format dump\n' > "$output"
EOF
cat > "$FAKE_BIN/stat" <<'EOF'
#!/usr/bin/env sh
for argument in "$@"; do file="$argument"; done
wc -c < "$file" | tr -d ' '
EOF
cat > "$FAKE_BIN/du" <<'EOF'
#!/usr/bin/env sh
for argument in "$@"; do path="$argument"; done
printf '14\t%s\n' "$path"
EOF
cat > "$FAKE_BIN/restic" <<'EOF'
#!/usr/bin/env sh
printf '%s\n' "$*" >> "$FAKE_RESTIC_LOG"
case "$1" in
  backup)
    printf '{"message_type":"summary","snapshot_id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}\n'
    ;;
  snapshots)
    printf '[{"id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","short_id":"bbbbbbbb"}]\n'
    ;;
  check | forget) ;;
  *) exit 1 ;;
esac
EOF
chmod 0755 "$FAKE_BIN"/*

FAKE_RESTIC_LOG="$TMP_DIR/restic.log" \
PATH="$FAKE_BIN:$PATH" \
BACKUP_STATE_DIR="$BACKUP_STATE" \
BACKUP_MEDIA_DIR="$BACKUP_MEDIA" \
BACKUP_DATABASE_URL=postgresql://fixture \
RESTIC_REPOSITORY=s3:fixture/repository \
RESTIC_PASSWORD=fixture-secret \
BACKUP_TRIGGER=pre-migration \
BACKUP_REASON=test-only \
BACKUP_RELEASE_ID=test-release-001 \
BACKUP_GIT_COMMIT=abcdef123456 \
IMAGE_TAG=stage5-test-abcdef123456 \
"$REPO_ROOT/infra/backup/backup.sh"

jq -e '
  .status == "succeeded"
  and .trigger == "pre-migration"
  and .releaseId == "test-release-001"
  and .snapshotId == "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  and .repositoryChecked == true
' "$BACKUP_STATE/last-success.json" >/dev/null
grep -q '^check$' "$TMP_DIR/restic.log"
grep -q '^forget ' "$TMP_DIR/restic.log"

if "$SCRIPTS_DIR/preflight.sh" --env-file "$REPO_ROOT/infra/.env.example" --dry-run >/dev/null 2>&1; then
  printf 'example environment unexpectedly passed production preflight\n' >&2
  exit 1
fi

PORT_FILE="$TMP_DIR/fixture.port"
PORT=0 PORT_FILE="$PORT_FILE" node "$TEST_DIR/fixture-server.mjs" &
SERVER_PID=$!
for _ in $(seq 1 50); do
  [[ -s "$PORT_FILE" ]] && break
  sleep 0.1
done
[[ -s "$PORT_FILE" ]] || {
  printf 'fixture server did not start\n' >&2
  exit 1
}

"$SCRIPTS_DIR/smoke.sh" \
  --base-url "http://127.0.0.1:$(cat "$PORT_FILE")" \
  --access-boundary local-test \
  --allow-http

printf 'infra script smoke tests passed\n'
