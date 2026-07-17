#!/usr/bin/env bash
set -Eeuo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
COMPOSE_FILE="$TEST_DIR/compose.local-restore-postgres.yaml"
FIXTURE_SCRIPT="$TEST_DIR/restore-drill-fixture.mjs"

for command in curl docker jq nc node pnpm sha256sum; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'required command not found: %s\n' "$command" >&2
    exit 1
  }
done

RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
SOURCE_PROJECT="our-tomorrow-offline-source-$RUN_ID"
TARGET_PROJECT="our-tomorrow-offline-target-$RUN_ID"
TEMP_ROOT="$(mktemp -d /private/tmp/our-tomorrow-offline-restore.XXXXXX)"
SOURCE_ENV="$TEMP_ROOT/source.env"
TARGET_ENV="$TEMP_ROOT/target.env"
SOURCE_MEDIA="$TEMP_ROOT/source-media"
BACKUP_MEDIA="$TEMP_ROOT/backup-media"
TARGET_MEDIA="$TEMP_ROOT/target-media"
DATABASE_DUMP="$TEMP_ROOT/postgres.dump"
CHECKSUM_FILE="$TEMP_ROOT/SHA256SUMS"
FIXTURE_STATE="$TEMP_ROOT/fixture-state.json"
FIXTURE_ASSERTIONS="$TEMP_ROOT/fixture-assertions.json"
SOURCE_LOG="$TEMP_ROOT/source-api.log"
TARGET_LOG="$TEMP_ROOT/target-api.log"
SOURCE_API_PID=""
TARGET_API_PID=""
SOURCE_CREATED=false
TARGET_CREATED=false
GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"

cleanup() {
  local status=$?
  for pid in "$TARGET_API_PID" "$SOURCE_API_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  if [[ "$TARGET_CREATED" == true ]]; then
    docker compose -p "$TARGET_PROJECT" --env-file "$TARGET_ENV" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  if [[ "$SOURCE_CREATED" == true ]]; then
    docker compose -p "$SOURCE_PROJECT" --env-file "$SOURCE_ENV" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  if (( status != 0 )); then
    printf '%s\n' '--- source API log ---' >&2
    tail -n 80 "$SOURCE_LOG" >&2 2>/dev/null || true
    printf '%s\n' '--- target API log ---' >&2
    tail -n 80 "$TARGET_LOG" >&2 2>/dev/null || true
    printf 'offline isolated restore drill failed; temporary projects were removed\n' >&2
  fi
  rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT

port_is_free() {
  ! nc -z 127.0.0.1 "$1" >/dev/null 2>&1
}

PORT_BASE=$((36000 + ($$ % 12000)))
for _ in $(seq 1 100); do
  if port_is_free "$PORT_BASE" \
    && port_is_free "$((PORT_BASE + 1))" \
    && port_is_free "$((PORT_BASE + 2))" \
    && port_is_free "$((PORT_BASE + 3))"; then
    break
  fi
  PORT_BASE=$((PORT_BASE + 10))
done
(( PORT_BASE + 3 < 65535 )) || {
  printf 'unable to allocate isolated ports\n' >&2
  exit 1
}

SOURCE_POSTGRES_PORT="$PORT_BASE"
TARGET_POSTGRES_PORT="$((PORT_BASE + 1))"
SOURCE_API_PORT="$((PORT_BASE + 2))"
TARGET_API_PORT="$((PORT_BASE + 3))"
SOURCE_BASE_URL="http://127.0.0.1:$SOURCE_API_PORT"
TARGET_BASE_URL="http://127.0.0.1:$TARGET_API_PORT"
DATABASE_NAME=our_tomorrow_offline_restore
DATABASE_USER=our_tomorrow_offline_restore
DATABASE_PASSWORD=offline-restore-isolated-database-20260717
SOURCE_DATABASE_URL="postgresql://$DATABASE_USER:$DATABASE_PASSWORD@127.0.0.1:$SOURCE_POSTGRES_PORT/$DATABASE_NAME?schema=public"
TARGET_DATABASE_URL="postgresql://$DATABASE_USER:$DATABASE_PASSWORD@127.0.0.1:$TARGET_POSTGRES_PORT/$DATABASE_NAME?schema=public"

write_env() {
  local destination="$1"
  local postgres_port="$2"
  cat > "$destination" <<EOF
POSTGRES_DB=$DATABASE_NAME
POSTGRES_USER=$DATABASE_USER
POSTGRES_PASSWORD=$DATABASE_PASSWORD
POSTGRES_PORT=$postgres_port
EOF
  chmod 0600 "$destination"
}

write_env "$SOURCE_ENV" "$SOURCE_POSTGRES_PORT"
write_env "$TARGET_ENV" "$TARGET_POSTGRES_PORT"
mkdir -p "$SOURCE_MEDIA" "$BACKUP_MEDIA" "$TARGET_MEDIA"

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

wait_postgres() {
  local project_kind="$1"
  local started_at
  local container_id
  local state
  started_at="$(date +%s)"
  while true; do
    if [[ "$project_kind" == source ]]; then
      container_id="$(source_compose ps -q postgres | head -n 1)"
    else
      container_id="$(target_compose ps -q postgres | head -n 1)"
    fi
    if [[ -n "$container_id" ]]; then
      state="$(docker inspect --format '{{.State.Health.Status}}' "$container_id")"
      [[ "$state" == healthy ]] && return 0
      [[ "$state" == unhealthy ]] && return 1
    fi
    (( $(date +%s) - started_at < 120 )) || return 1
    sleep 2
  done
}

wait_api() {
  local base_url="$1"
  local pid="$2"
  local started_at
  started_at="$(date +%s)"
  while true; do
    if curl --fail --silent --show-error "$base_url/api/v1/health/ready" >/dev/null 2>&1; then
      return 0
    fi
    kill -0 "$pid" 2>/dev/null || return 1
    (( $(date +%s) - started_at < 120 )) || return 1
    sleep 1
  done
}

start_api() {
  local database_url="$1"
  local media_path="$2"
  local api_port="$3"
  local base_url="$4"
  local log_file="$5"
  DATABASE_URL="$database_url" \
  MEDIA_STORAGE_PATH="$media_path" \
  PORT="$api_port" \
  API_PORT="$api_port" \
  PUBLIC_APP_URL="$base_url" \
  WEB_ORIGIN="$base_url" \
  TRUST_PROXY=false \
  NODE_ENV=production \
  TZ=UTC \
  APP_VERSION="restore-drill-$GIT_COMMIT" \
  node "$REPO_ROOT/apps/api/dist/main.js" > "$log_file" 2>&1 &
  printf '%s' "$!"
}

core_counts() {
  local project_kind="$1"
  if [[ "$project_kind" == source ]]; then
    source_compose exec -T postgres psql --username "$DATABASE_USER" --dbname "$DATABASE_NAME" --tuples-only --no-align --field-separator='=' --set ON_ERROR_STOP=1 --command "
      SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'couples', count(*) FROM couples
      UNION ALL SELECT 'couple_members', count(*) FROM couple_members
      UNION ALL SELECT 'memories', count(*) FROM memories
      UNION ALL SELECT 'media_assets', count(*) FROM media_assets
      UNION ALL SELECT 'capsules', count(*) FROM capsules
      UNION ALL SELECT 'capsule_messages', count(*) FROM capsule_messages
      ORDER BY 1;
    "
  else
    target_compose exec -T postgres psql --username "$DATABASE_USER" --dbname "$DATABASE_NAME" --tuples-only --no-align --field-separator='=' --set ON_ERROR_STOP=1 --command "
      SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'couples', count(*) FROM couples
      UNION ALL SELECT 'couple_members', count(*) FROM couple_members
      UNION ALL SELECT 'memories', count(*) FROM memories
      UNION ALL SELECT 'media_assets', count(*) FROM media_assets
      UNION ALL SELECT 'capsules', count(*) FROM capsules
      UNION ALL SELECT 'capsule_messages', count(*) FROM capsule_messages
      ORDER BY 1;
    "
  fi
}

printf 'building current API for the offline restore drill\n'
pnpm --filter @our-tomorrow/api build

SOURCE_CREATED=true
source_compose up -d postgres
wait_postgres source
DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter @our-tomorrow/api exec prisma migrate deploy --schema prisma/schema.prisma

SOURCE_API_PID="$(start_api "$SOURCE_DATABASE_URL" "$SOURCE_MEDIA" "$SOURCE_API_PORT" "$SOURCE_BASE_URL" "$SOURCE_LOG")"
wait_api "$SOURCE_BASE_URL" "$SOURCE_API_PID"
node "$FIXTURE_SCRIPT" seed "$SOURCE_BASE_URL" "$FIXTURE_STATE"
node "$FIXTURE_SCRIPT" assert "$SOURCE_BASE_URL" "$FIXTURE_STATE"
SOURCE_COUNTS="$(core_counts source)"

source_compose exec -T postgres pg_dump \
  --username "$DATABASE_USER" \
  --dbname "$DATABASE_NAME" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-privileges > "$DATABASE_DUMP"
(
  cd "$TEMP_ROOT"
  sha256sum postgres.dump > SHA256SUMS
)
cp -a "$SOURCE_MEDIA/." "$BACKUP_MEDIA/"

kill "$SOURCE_API_PID"
wait "$SOURCE_API_PID" 2>/dev/null || true
SOURCE_API_PID=""

TARGET_CREATED=true
target_compose up -d postgres
wait_postgres target
target_compose exec -T postgres pg_restore \
  --username "$DATABASE_USER" \
  --dbname "$DATABASE_NAME" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error < "$DATABASE_DUMP"

DATABASE_URL="$TARGET_DATABASE_URL" pnpm --filter @our-tomorrow/api exec prisma migrate deploy --schema prisma/schema.prisma
cp -a "$BACKUP_MEDIA/." "$TARGET_MEDIA/"

TARGET_API_PID="$(start_api "$TARGET_DATABASE_URL" "$TARGET_MEDIA" "$TARGET_API_PORT" "$TARGET_BASE_URL" "$TARGET_LOG")"
wait_api "$TARGET_BASE_URL" "$TARGET_API_PID"
node "$FIXTURE_SCRIPT" assert "$TARGET_BASE_URL" "$FIXTURE_STATE" "$FIXTURE_ASSERTIONS"
TARGET_COUNTS="$(core_counts target)"
[[ "$SOURCE_COUNTS" == "$TARGET_COUNTS" ]] || {
  printf 'core table counts changed across restore\n' >&2
  exit 1
}

VISIBLE_MEDIA_ID="$(jq -er '.visibleMedia.id' "$FIXTURE_STATE")"
SECRET_MEDIA_ID="$(jq -er '.secretMedia.id' "$FIXTURE_STATE")"
MEDIA_PATHS="$(target_compose exec -T postgres psql --username "$DATABASE_USER" --dbname "$DATABASE_NAME" --tuples-only --no-align --field-separator='|' --set ON_ERROR_STOP=1 --command "
  SELECT storage_key, COALESCE(thumbnail_key, '')
  FROM media_assets
  WHERE id IN ('$VISIBLE_MEDIA_ID'::uuid, '$SECRET_MEDIA_ID'::uuid)
  ORDER BY id;
")"

DECODED_FILES=0
while IFS='|' read -r storage_key thumbnail_key; do
  [[ -n "$storage_key" ]] || continue
  for relative_path in "$storage_key" "$thumbnail_key"; do
    [[ -n "$relative_path" ]] || continue
    absolute_path="$TARGET_MEDIA/$relative_path"
    [[ -f "$absolute_path" ]] || {
      printf 'restored media file missing\n' >&2
      exit 1
    }
    node -e '
      const sharp = require("./apps/api/node_modules/sharp");
      sharp(process.argv[1]).metadata().then((metadata) => {
        if (!metadata.format || !metadata.width || !metadata.height) process.exit(1);
      }).catch(() => process.exit(1));
    ' "$absolute_path"
    DECODED_FILES=$((DECODED_FILES + 1))
  done
done <<< "$MEDIA_PATHS"
[[ "$DECODED_FILES" -ge 4 ]] || {
  printf 'expected at least four restored media files to decode\n' >&2
  exit 1
}

DUMP_SHA256="$(awk '{print $1}' "$CHECKSUM_FILE")"
LATEST_MIGRATION="$(target_compose exec -T postgres psql --username "$DATABASE_USER" --dbname "$DATABASE_NAME" --tuples-only --no-align --set ON_ERROR_STOP=1 --command '
  SELECT migration_name
  FROM "_prisma_migrations"
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  ORDER BY finished_at DESC
  LIMIT 1;
')"
COUNTS_JSON="$(printf '%s\n' "$TARGET_COUNTS" | jq -Rn '[inputs | select(length > 0) | split("=") | {(.[0]): (.[1] | tonumber)}] | add')"
EVIDENCE_FILE="$REPO_ROOT/infra/restore-drills/our-tomorrow-offline-$RUN_ID.json"
jq -n \
  --arg format our-tomorrow-offline-restore-drill \
  --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$GIT_COMMIT" \
  --arg sourceProject "$SOURCE_PROJECT" \
  --arg targetProject "$TARGET_PROJECT" \
  --arg dumpSha256 "$DUMP_SHA256" \
  --arg latestMigration "$LATEST_MIGRATION" \
  --argjson counts "$COUNTS_JSON" \
  --argjson decodedMediaFiles "$DECODED_FILES" \
  --slurpfile fixture "$FIXTURE_ASSERTIONS" \
  '{
    format: $format,
    version: 1,
    status: "succeeded",
    completedAt: $completedAt,
    gitCommit: $gitCommit,
    isolation: {
      sourceProject: $sourceProject,
      targetProject: $targetProject,
      sourceDatabase: "dedicated-compose-volume",
      targetDatabase: "dedicated-compose-volume",
      sharedStage3E2eDatabaseTouched: false
    },
    backup: {
      databaseFormat: "pg_dump-custom",
      databaseSha256: $dumpSha256,
      mediaTransport: "isolated-private-directory-copy"
    },
    compatibility: {
      exercisedPostgresMajor: 15,
      productionBaselinePostgresMajor: 16,
      limitation: "Docker registry failure prevented the production-image/Restic path; a PostgreSQL 16 + Restic drill remains required before production."
    },
    latestMigration: $latestMigration,
    counts: $counts,
    decodedMediaFiles: $decodedMediaFiles,
    fixtureAssertions: $fixture[0].checks
  }' > "$EVIDENCE_FILE"
chmod 0600 "$EVIDENCE_FILE"

printf 'offline isolated restore drill succeeded\n'
printf 'evidence: %s\n' "$EVIDENCE_FILE"
