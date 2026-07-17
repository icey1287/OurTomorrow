#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

ENV_FILE="$REPO_ROOT/infra/.env.restore"
COMPOSE_FILE="$REPO_ROOT/infra/compose.yaml"
SNAPSHOT_ID=""
PROJECT="our-tomorrow-drill-$(date -u +%Y%m%d%H%M%S)"
BASE_URL=""
KEEP=false
SKIP_BUILD=false
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: infra/scripts/restore-drill.sh --snapshot SNAPSHOT_ID [options]

Restore one exact Restic snapshot into a new, localhost-only Compose project.
Worker and backup services remain stopped. The production env file/project is refused.

Options:
  --env-file PATH       Drill-only environment file (default: infra/.env.restore)
  --compose-file PATH   Compose file (default: infra/compose.yaml)
  --snapshot ID         Exact Restic snapshot ID, never implicit latest (required)
  --project NAME        Must match our-tomorrow-drill-* and not already exist
  --base-url URL        Local HTTP URL (default: PUBLIC_APP_URL in drill env)
  --keep                 Keep isolated containers/volumes for manual inspection
  --skip-build           Use already available images
  --dry-run              Print the destructive-looking drill steps without running them
  -h, --help             Show this help
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --env-file)
      ENV_FILE="$(absolute_from_repo "${2:?missing value for --env-file}")"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="$(absolute_from_repo "${2:?missing value for --compose-file}")"
      shift 2
      ;;
    --snapshot)
      SNAPSHOT_ID="${2:?missing value for --snapshot}"
      shift 2
      ;;
    --project)
      PROJECT="${2:?missing value for --project}"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:?missing value for --base-url}"
      shift 2
      ;;
    --keep)
      KEEP=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ "$SNAPSHOT_ID" =~ ^[A-Fa-f0-9]{64}$ ]] || die "--snapshot must be the full 64-character hexadecimal Restic ID"
[[ "$PROJECT" =~ ^our-tomorrow-drill-[A-Za-z0-9_-]+$ ]] || die "--project must match our-tomorrow-drill-*"
[[ -f "$ENV_FILE" ]] || die "drill environment file not found: $ENV_FILE"
[[ "$ENV_FILE" != "$REPO_ROOT/infra/.env" ]] || die "the production infra/.env file is forbidden for restore drills"

BASE_URL="${BASE_URL:-$(env_or_default PUBLIC_APP_URL "$ENV_FILE" '')}"
BASE_URL="${BASE_URL%/}"
[[ "$BASE_URL" == http://127.0.0.1:* || "$BASE_URL" == http://localhost:* ]] || die "restore drill base URL must be localhost HTTP on an explicit high port"
HTTP_PORT_VALUE="$(env_or_default HTTP_PORT "$ENV_FILE" '')"
[[ "$HTTP_PORT_VALUE" =~ ^[0-9]+$ && "$HTTP_PORT_VALUE" -ge 1024 ]] || die "restore drill HTTP_PORT must be an unprivileged port (>=1024)"
[[ "$BASE_URL" == *":$HTTP_PORT_VALUE" ]] || die "restore drill base URL must use HTTP_PORT=$HTTP_PORT_VALUE"

RESTIC_REPOSITORY_VALUE="$(env_or_default RESTIC_REPOSITORY "$ENV_FILE" '')"
[[ -n "$RESTIC_REPOSITORY_VALUE" ]] || die "RESTIC_REPOSITORY is required"
BACKUP_REPOSITORY_SOURCE_VALUE="$(env_or_default BACKUP_REPOSITORY_SOURCE "$ENV_FILE" backup_data)"
if [[ "$RESTIC_REPOSITORY_VALUE" == "/backups/restic" && "$BACKUP_REPOSITORY_SOURCE_VALUE" == "backup_data" ]]; then
  die "the project-local /backups/restic named volume is empty in a drill; use an off-host repository or an isolated absolute BACKUP_REPOSITORY_SOURCE"
fi
if [[ "$BACKUP_REPOSITORY_SOURCE_VALUE" != "backup_data" ]]; then
  [[ "$BACKUP_REPOSITORY_SOURCE_VALUE" = /* ]] || die "drill BACKUP_REPOSITORY_SOURCE must be an absolute isolated host path"
  [[ "$BACKUP_REPOSITORY_SOURCE_VALUE" != /var/lib/docker/* ]] || die "direct Docker storage paths are forbidden"
fi
BACKUP_KEY_VALUE="$(env_or_default BACKUP_ENCRYPTION_KEY "$ENV_FILE" '')"
is_placeholder_secret "$BACKUP_KEY_VALUE" && die "BACKUP_ENCRYPTION_KEY is empty or still an example value"

export COMPOSE_PROJECT_NAME="$PROJECT"
preflight_args=(--env-file "$ENV_FILE" --compose-file "$COMPOSE_FILE" --mode local)
[[ "$DRY_RUN" == true ]] && preflight_args+=(--dry-run)
"$SCRIPT_DIR/preflight.sh" "${preflight_args[@]}"

if [[ "$DRY_RUN" == true ]]; then
  log "dry-run restore project: $PROJECT"
  [[ "$SKIP_BUILD" == true ]] || compose_print build backup api web
  compose_print run --rm --no-deps backup restic snapshots "$SNAPSHOT_ID" --json
  compose_print run --rm --no-deps --user root --volume '<temporary-dir>:/restore' backup restic restore "$SNAPSHOT_ID" --target /restore
  compose_print up -d --no-deps postgres
  log "would verify metadata/checksum, restore PostgreSQL and media, then run current migrations"
  compose_print up -d --no-deps api web caddy
  "$SCRIPT_DIR/smoke.sh" --base-url "$BASE_URL" --access-boundary restore-drill --allow-http --dry-run
  log "would record counts/evidence and remove only project $PROJECT unless --keep is set"
  exit 0
fi

require_command jq

if [[ -n "$(compose ps -a -q 2>/dev/null)" ]]; then
  die "Compose project already exists; choose a new drill project name: $PROJECT"
fi

DRILL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/our-tomorrow-restore.XXXXXX")"
REPORT_DIR="$REPO_ROOT/infra/restore-drills"
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/$PROJECT.json"
PROJECT_CREATED=false
DRILL_SUCCEEDED=false
STARTED_AT="$(now_utc)"

cleanup() {
  local status=$?
  rm -rf "$DRILL_DIR"
  if [[ "$PROJECT_CREATED" == true && "$KEEP" != true ]]; then
    case "$PROJECT" in
      our-tomorrow-drill-*) compose down --volumes --remove-orphans >/dev/null 2>&1 || true ;;
      *) warn "refused cleanup for unexpected project name: $PROJECT" ;;
    esac
  elif [[ "$PROJECT_CREATED" == true ]]; then
    warn "kept isolated drill project for inspection: $PROJECT"
  fi
  if (( status != 0 )); then
    warn "restore drill failed; no production project was touched"
  fi
}
trap cleanup EXIT

if [[ "$SKIP_BUILD" != true ]]; then
  compose build backup api web
fi

PROJECT_CREATED=true
compose run --rm --no-deps backup restic snapshots "$SNAPSHOT_ID" --json \
  | jq -e --arg snapshot "$SNAPSHOT_ID" 'length == 1 and .[0].id == $snapshot' >/dev/null \
  || die "snapshot is missing or ambiguous: $SNAPSHOT_ID"

compose run --rm --no-deps --user root \
  --volume "$DRILL_DIR:/restore" \
  backup restic restore "$SNAPSHOT_ID" --target /restore

STAGING_DIR="$DRILL_DIR/var/lib/backup/staging"
[[ -f "$STAGING_DIR/postgres.dump" ]] || die "snapshot does not contain postgres.dump"
[[ -f "$STAGING_DIR/SHA256SUMS" ]] || die "snapshot does not contain SHA256SUMS"
[[ -f "$STAGING_DIR/metadata.json" ]] || die "snapshot does not contain metadata.json"
[[ -d "$DRILL_DIR/media" ]] || die "snapshot does not contain the media directory"

jq -e '
  .format == "our-tomorrow-backup"
  and (.version == 1 or .version == 2)
  and ((if .version == 1 then .postgresMajor else .database.postgresMajor end) == 16)
' "$STAGING_DIR/metadata.json" >/dev/null || die "unsupported backup metadata format/PostgreSQL major"

compose run --rm --no-deps --user root \
  --volume "$DRILL_DIR:/restore:ro" \
  backup sh -c '
    cd /restore/var/lib/backup/staging
    expected="$(awk "{print \$1}" SHA256SUMS)"
    actual="$(sha256sum postgres.dump | awk "{print \$1}")"
    test "$expected" = "$actual"
  '

compose up -d --no-deps postgres
wait_for_service postgres healthy 180

compose exec -T postgres sh -c \
  'pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error' \
  < "$STAGING_DIR/postgres.dump"

compose run --rm --no-deps --user root --entrypoint sh \
  --volume "$DRILL_DIR/media:/restore-media:ro" \
  api -c 'cp -a /restore-media/. /data/media/'

compose run --rm --no-deps migrate
compose up -d --no-deps api web
wait_for_service api healthy 180
wait_for_service web healthy 180
compose up -d --no-deps caddy
wait_for_service caddy running 60

"$SCRIPT_DIR/smoke.sh" \
  --base-url "$BASE_URL" \
  --access-boundary restore-drill \
  --allow-http

COUNTS_TSV="$(compose exec -T postgres sh -c '
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --field-separator="=" --set ON_ERROR_STOP=1 --command "
    SELECT '\''users'\'', count(*) FROM users
    UNION ALL SELECT '\''couples'\'', count(*) FROM couples
    UNION ALL SELECT '\''couple_members'\'', count(*) FROM couple_members
    UNION ALL SELECT '\''memories'\'', count(*) FROM memories
    UNION ALL SELECT '\''media_assets'\'', count(*) FROM media_assets
    UNION ALL SELECT '\''wishes'\'', count(*) FROM wishes
    UNION ALL SELECT '\''capsules'\'', count(*) FROM capsules
    UNION ALL SELECT '\''scheduled_events'\'', count(*) FROM scheduled_events
    ORDER BY 1;
  "
')"

COUNTS_JSON="$(printf '%s\n' "$COUNTS_TSV" | jq -Rn '
  [inputs | select(length > 0) | split("=") | {(.[0]): (.[1] | tonumber)}] | add // {}
')"

MEDIA_SAMPLE="$(compose exec -T postgres sh -c '
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --field-separator="|" --set ON_ERROR_STOP=1 --command "
    SELECT storage_key, COALESCE(thumbnail_key, '\'''\'')
    FROM media_assets
    WHERE status = '\''READY'\'' AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10;
  "
')"

MEDIA_CHECKED=0
while IFS='|' read -r storage_key thumbnail_key; do
  [[ -n "$storage_key" ]] || continue
  compose exec -T api sh -c '
    test -f "/data/media/$1"
    if [ -n "$2" ]; then test -f "/data/media/$2"; fi
  ' sh "$storage_key" "$thumbnail_key"
  compose exec -T api node -e '
    const sharp = require("sharp");
    const paths = process.argv.slice(1).filter(Boolean).map((value) => `/data/media/${value}`);
    Promise.all(paths.map((value) => sharp(value).metadata())).then((items) => {
      if (items.some((item) => !item.format || !item.width || !item.height)) process.exit(1);
    }).catch(() => process.exit(1));
  ' "$storage_key" "$thumbnail_key"
  MEDIA_CHECKED=$((MEDIA_CHECKED + 1))
done <<< "$MEDIA_SAMPLE"

COMPLETED_AT="$(now_utc)"
METADATA_VERSION="$(jq -er '.version' "$STAGING_DIR/metadata.json")"
BACKUP_STARTED_AT="$(jq -er '.startedAt' "$STAGING_DIR/metadata.json")"
TMP_REPORT="$REPORT_FILE.tmp.$$"
jq -n \
  --arg format our-tomorrow-restore-drill \
  --argjson version 1 \
  --arg project "$PROJECT" \
  --arg snapshotId "$SNAPSHOT_ID" \
  --arg startedAt "$STARTED_AT" \
  --arg completedAt "$COMPLETED_AT" \
  --arg backupStartedAt "$BACKUP_STARTED_AT" \
  --argjson backupMetadataVersion "$METADATA_VERSION" \
  --arg gitCommit "$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)" \
  --argjson counts "$COUNTS_JSON" \
  --argjson mediaSamplesChecked "$MEDIA_CHECKED" \
  '{
    format: $format,
    version: $version,
    status: "succeeded",
    project: $project,
    snapshotId: $snapshotId,
    startedAt: $startedAt,
    completedAt: $completedAt,
    backupStartedAt: $backupStartedAt,
    backupMetadataVersion: $backupMetadataVersion,
    gitCommit: $gitCommit,
    counts: $counts,
    mediaSamplesChecked: $mediaSamplesChecked,
    checks: {
      checksum: true,
      postgresRestore: true,
      migrations: true,
      health: true,
      securityHeaders: true,
      sharedBoyGirlCouple: true,
      mediaFilesDecoded: true
    }
  }' > "$TMP_REPORT"
chmod 0600 "$TMP_REPORT"
mv "$TMP_REPORT" "$REPORT_FILE"

DRILL_SUCCEEDED=true
log "restore drill succeeded: $PROJECT"
log "evidence: $REPORT_FILE"
log "READY media files sampled: $MEDIA_CHECKED"
