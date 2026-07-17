#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/compose.yaml"
RESTORE_SCRIPT="$REPO_ROOT/infra/scripts/restore-drill.sh"
FIXTURE_SCRIPT="$TEST_DIR/restore-drill-fixture.mjs"

for command in docker jq node nc; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'required command not found: %s\n' "$command" >&2
    exit 1
  }
done

RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
SOURCE_PROJECT="our-tomorrow-restore-source-$RUN_ID"
TARGET_PROJECT="our-tomorrow-drill-real-$RUN_ID"
TEMP_ROOT="$(mktemp -d /private/tmp/our-tomorrow-real-restore.XXXXXX)"
REPOSITORY_DIR="$TEMP_ROOT/repository"
SOURCE_ENV="$TEMP_ROOT/source.env"
TARGET_ENV="$TEMP_ROOT/target.env"
FIXTURE_STATE="$TEMP_ROOT/fixture-state.json"
FIXTURE_ASSERTIONS="$TEMP_ROOT/fixture-assertions.json"
GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
GIT_SHORT="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
IMAGE_TAG="restore-drill-$GIT_SHORT"
TARGET_CREATED=false
SOURCE_CREATED=false

case "$SOURCE_PROJECT" in
  our-tomorrow-restore-source-*) ;;
  *) printf 'unsafe source project name\n' >&2; exit 1 ;;
esac
case "$TARGET_PROJECT" in
  our-tomorrow-drill-real-*) ;;
  *) printf 'unsafe target project name\n' >&2; exit 1 ;;
esac

cleanup() {
  local status=$?
  if [[ "$TARGET_CREATED" == true ]]; then
    docker compose -p "$TARGET_PROJECT" --env-file "$TARGET_ENV" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  if [[ "$SOURCE_CREATED" == true ]]; then
    docker compose -p "$SOURCE_PROJECT" --env-file "$SOURCE_ENV" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$TEMP_ROOT"
  if (( status != 0 )); then
    printf 'isolated local restore drill failed; projects were cleaned up\n' >&2
  fi
}
trap cleanup EXIT

port_is_free() {
  ! nc -z 127.0.0.1 "$1" >/dev/null 2>&1
}

PORT_BASE=$((30000 + ($$ % 20000)))
for _ in $(seq 1 100); do
  if port_is_free "$PORT_BASE" \
    && port_is_free "$((PORT_BASE + 1))" \
    && port_is_free "$((PORT_BASE + 2))" \
    && port_is_free "$((PORT_BASE + 3))" \
    && port_is_free "$((PORT_BASE + 4))" \
    && port_is_free "$((PORT_BASE + 5))"; then
    break
  fi
  PORT_BASE=$((PORT_BASE + 10))
done
(( PORT_BASE + 5 < 65535 )) || {
  printf 'unable to allocate isolated local ports\n' >&2
  exit 1
}

SOURCE_HTTP_PORT="$PORT_BASE"
SOURCE_HTTPS_PORT="$((PORT_BASE + 1))"
SOURCE_POSTGRES_PORT="$((PORT_BASE + 2))"
TARGET_HTTP_PORT="$((PORT_BASE + 3))"
TARGET_HTTPS_PORT="$((PORT_BASE + 4))"
TARGET_POSTGRES_PORT="$((PORT_BASE + 5))"
SOURCE_BASE_URL="http://localhost:$SOURCE_HTTP_PORT"
TARGET_BASE_URL="http://localhost:$TARGET_HTTP_PORT"

mkdir -p "$REPOSITORY_DIR"

write_env() {
  local destination="$1"
  local public_url="$2"
  local http_port="$3"
  local https_port="$4"
  local postgres_port="$5"
  cat > "$destination" <<EOF
ACCESS_BOUNDARY=private-interface
PRIVATE_ACCESS_ACKNOWLEDGED=false
CADDY_BIND_ADDRESS=127.0.0.1
APP_SITE_ADDRESS=http://localhost
NODE_ENV=production
PUBLIC_APP_URL=$public_url
WEB_ORIGIN=$public_url
HTTP_PORT=$http_port
HTTPS_PORT=$https_port
IMAGE_TAG=$IMAGE_TAG
DEPLOY_IMAGE_MODE=build
DEPLOY_HEALTH_TIMEOUT_SECONDS=600
DEPLOY_RECORD_DIR=infra/releases
POSTGRES_DB=our_tomorrow_restore_fixture
POSTGRES_USER=our_tomorrow_restore_fixture
POSTGRES_PASSWORD=isolated-restore-fixture-database-20260717
POSTGRES_PORT=$postgres_port
DATABASE_URL=postgresql://our_tomorrow_restore_fixture:isolated-restore-fixture-database-20260717@postgres:5432/our_tomorrow_restore_fixture?schema=public
BACKUP_DATABASE_URL=postgresql://our_tomorrow_restore_fixture:isolated-restore-fixture-database-20260717@postgres:5432/our_tomorrow_restore_fixture
MEDIA_MAX_BYTES=15728640
MEDIA_MAX_PIXELS=40000000
MEDIA_UPLOAD_TTL_SECONDS=900
RESTIC_REPOSITORY=/backups/restic
BACKUP_REPOSITORY_SOURCE=$REPOSITORY_DIR
BACKUP_ENCRYPTION_KEY=isolated-restore-fixture-restic-20260717
BACKUP_OFFSITE_ACKNOWLEDGED=false
BACKUP_HOST_LABEL=our-tomorrow-local-restore-fixture
RESTIC_KEEP_DAILY=14
RESTIC_KEEP_WEEKLY=8
RESTIC_KEEP_MONTHLY=12
BACKUP_MAX_AGE_SECONDS=129600
RESTIC_CHECK_REPOSITORY=true
RESTIC_CHECK_READ_DATA_SUBSET=
TZ=Asia/Shanghai
EOF
  chmod 0600 "$destination"
}

write_env "$SOURCE_ENV" "$SOURCE_BASE_URL" "$SOURCE_HTTP_PORT" "$SOURCE_HTTPS_PORT" "$SOURCE_POSTGRES_PORT"
write_env "$TARGET_ENV" "$TARGET_BASE_URL" "$TARGET_HTTP_PORT" "$TARGET_HTTPS_PORT" "$TARGET_POSTGRES_PORT"

if grep -q 'stage3-e2e\|55433\|our_tomorrow_stage3_e2e' "$SOURCE_ENV" "$TARGET_ENV"; then
  printf 'refusing any reference to the shared stage3-e2e database\n' >&2
  exit 1
fi

source_compose() {
  docker compose -p "$SOURCE_PROJECT" --env-file "$SOURCE_ENV" -f "$COMPOSE_FILE" "$@"
}

target_compose() {
  docker compose -p "$TARGET_PROJECT" --env-file "$TARGET_ENV" -f "$COMPOSE_FILE" "$@"
}

wait_service() {
  local project_kind="$1"
  local service="$2"
  local expected="$3"
  local timeout="$4"
  local started_at
  local container_id
  local state
  started_at="$(date +%s)"

  while true; do
    if [[ "$project_kind" == source ]]; then
      container_id="$(source_compose ps -q "$service" | head -n 1)"
    else
      container_id="$(target_compose ps -q "$service" | head -n 1)"
    fi
    if [[ -n "$container_id" ]]; then
      if [[ "$expected" == running ]]; then
        state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
      else
        state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
      fi
      [[ "$state" == "$expected" ]] && return 0
      if [[ "$state" == exited || "$state" == dead || "$state" == unhealthy ]]; then
        printf '%s/%s entered %s\n' "$project_kind" "$service" "$state" >&2
        return 1
      fi
    fi
    if (( $(date +%s) - started_at >= timeout )); then
      printf 'timed out waiting for %s/%s=%s\n' "$project_kind" "$service" "$expected" >&2
      return 1
    fi
    sleep 2
  done
}

printf 'building isolated drill images (%s)\n' "$IMAGE_TAG"
source_compose build api web backup

SOURCE_CREATED=true
source_compose up -d --no-deps postgres
wait_service source postgres healthy 180
source_compose run --rm --no-deps migrate
source_compose up -d --no-deps api web
wait_service source api healthy 180
wait_service source web healthy 180
source_compose up -d --no-deps caddy
wait_service source caddy running 60

node "$FIXTURE_SCRIPT" seed "$SOURCE_BASE_URL" "$FIXTURE_STATE"
node "$FIXTURE_SCRIPT" assert "$SOURCE_BASE_URL" "$FIXTURE_STATE"

source_compose up -d --no-deps backup
wait_service source backup healthy 600
SNAPSHOT_ID="$(source_compose exec -T backup jq -er '.snapshotId' /var/lib/backup/last-success.json)"
[[ "$SNAPSHOT_ID" =~ ^[a-f0-9]{64}$ ]] || {
  printf 'source backup did not produce a full snapshot ID\n' >&2
  exit 1
}
source_compose exec -T backup restic snapshots "$SNAPSHOT_ID" --json \
  | jq -e --arg snapshot "$SNAPSHOT_ID" 'length == 1 and .[0].id == $snapshot' >/dev/null

source_compose stop caddy web api backup

TARGET_CREATED=true
"$RESTORE_SCRIPT" \
  --env-file "$TARGET_ENV" \
  --snapshot "$SNAPSHOT_ID" \
  --project "$TARGET_PROJECT" \
  --base-url "$TARGET_BASE_URL" \
  --skip-build \
  --keep

node "$FIXTURE_SCRIPT" assert "$TARGET_BASE_URL" "$FIXTURE_STATE" "$FIXTURE_ASSERTIONS"

EVIDENCE_FILE="$REPO_ROOT/infra/restore-drills/$TARGET_PROJECT.json"
[[ -f "$EVIDENCE_FILE" ]] || {
  printf 'restore script did not write evidence\n' >&2
  exit 1
}
EVIDENCE_TMP="$EVIDENCE_FILE.tmp.$$"
jq \
  --arg sourceProject "$SOURCE_PROJECT" \
  --arg targetProject "$TARGET_PROJECT" \
  --arg sourceImageTag "$IMAGE_TAG" \
  --arg sourceGitCommit "$GIT_COMMIT" \
  --slurpfile fixture "$FIXTURE_ASSERTIONS" \
  '.isolation = {
      sourceProject: $sourceProject,
      targetProject: $targetProject,
      sourceDatabase: "dedicated-compose-volume",
      targetDatabase: "dedicated-compose-volume",
      backupRepository: "isolated-host-directory",
      sharedStage3E2eDatabaseTouched: false
    }
    | .source = {
      imageTag: $sourceImageTag,
      gitCommit: $sourceGitCommit
    }
    | .fixtureAssertions = $fixture[0].checks' \
  "$EVIDENCE_FILE" > "$EVIDENCE_TMP"
chmod 0600 "$EVIDENCE_TMP"
mv "$EVIDENCE_TMP" "$EVIDENCE_FILE"

printf 'isolated local restore drill succeeded\n'
printf 'snapshot: %s\n' "$SNAPSHOT_ID"
printf 'evidence: %s\n' "$EVIDENCE_FILE"
