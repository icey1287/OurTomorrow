#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

ENV_FILE="$REPO_ROOT/infra/.env"
COMPOSE_FILE="$REPO_ROOT/infra/compose.yaml"
IMAGE_TAG_OVERRIDE=""
RELEASE_ID=""
DRY_RUN=false
SKIP_BUILD=false

usage() {
  cat <<'EOF'
Usage: infra/scripts/deploy.sh --image-tag TAG [options]

Safe staged Compose release:
preflight -> image preparation -> healthy data services -> verified backup ->
migration -> healthy app services -> HTTPS/security/boy+girl smoke -> record.

Options:
  --env-file PATH       Compose environment file (default: infra/.env)
  --compose-file PATH   Compose file (default: infra/compose.yaml)
  --image-tag TAG       Immutable application image tag (required in production)
  --release-id ID       Release identifier (default: timestamp + Git SHA)
  --skip-build          Use existing local images (DEPLOY_IMAGE_MODE=build only)
  --dry-run             Print state-changing commands without executing them
  -h, --help            Show this help
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
    --image-tag)
      IMAGE_TAG_OVERRIDE="${2:?missing value for --image-tag}"
      shift 2
      ;;
    --release-id)
      RELEASE_ID="${2:?missing value for --release-id}"
      shift 2
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

require_command git
require_command jq

GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
GIT_SHORT="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
IMAGE_TAG="${IMAGE_TAG_OVERRIDE:-$(env_or_default IMAGE_TAG "$ENV_FILE" local)}"
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._:@/-]{1,127}$ ]] || die "--image-tag contains unsupported characters"
[[ "$IMAGE_TAG" != "local" && "$IMAGE_TAG" != "latest" && "$IMAGE_TAG" != *:latest ]] || die "deployments require an immutable image tag, not local/latest"

if [[ -z "$RELEASE_ID" ]]; then
  RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$GIT_SHORT"
fi
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._:-]{3,128}$ ]] || die "--release-id contains unsupported characters"

export IMAGE_TAG GIT_COMMIT

preflight_args=(--env-file "$ENV_FILE" --compose-file "$COMPOSE_FILE" --mode production)
[[ "$DRY_RUN" == true ]] && preflight_args+=(--dry-run)
"$SCRIPT_DIR/preflight.sh" "${preflight_args[@]}"

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    warn "worktree is dirty; an actual source-built deployment would be refused"
  else
    die "worktree has tracked changes; commit and verify the release before deployment"
  fi
fi

IMAGE_MODE="$(env_or_default DEPLOY_IMAGE_MODE "$ENV_FILE" build)"
[[ "$IMAGE_MODE" == "build" || "$IMAGE_MODE" == "pull" ]] || die "DEPLOY_IMAGE_MODE must be build or pull"
[[ "$IMAGE_MODE" == "build" || "$SKIP_BUILD" != true ]] || die "--skip-build is only valid with DEPLOY_IMAGE_MODE=build"
HEALTH_TIMEOUT="$(env_or_default DEPLOY_HEALTH_TIMEOUT_SECONDS "$ENV_FILE" 300)"
[[ "$HEALTH_TIMEOUT" =~ ^[0-9]+$ && "$HEALTH_TIMEOUT" -ge 30 ]] || die "DEPLOY_HEALTH_TIMEOUT_SECONDS must be at least 30"
PUBLIC_URL="$(env_or_default PUBLIC_APP_URL "$ENV_FILE" '')"
ACCESS_BOUNDARY="$(env_or_default ACCESS_BOUNDARY "$ENV_FILE" '')"
RECORD_DIR="$(absolute_from_repo "$(env_or_default DEPLOY_RECORD_DIR "$ENV_FILE" infra/releases)")"

PREVIOUS_RELEASE_ID=""
PREVIOUS_IMAGE_TAG=""
if [[ -f "$RECORD_DIR/current.env" ]]; then
  PREVIOUS_RELEASE_ID="$(env_or_default RELEASE_ID "$RECORD_DIR/current.env" '')"
  PREVIOUS_IMAGE_TAG="$(env_or_default IMAGE_TAG "$RECORD_DIR/current.env" '')"
fi

if [[ "$DRY_RUN" == true ]]; then
  log "dry-run release $RELEASE_ID ($GIT_COMMIT, image $IMAGE_TAG, mode $IMAGE_MODE)"
  if [[ "$IMAGE_MODE" == "build" && "$SKIP_BUILD" != true ]]; then
    compose_print build api web backup
  elif [[ "$IMAGE_MODE" == "pull" ]]; then
    compose_print pull api worker web backup
  fi
  compose_print up -d --no-deps postgres
  log "would wait for postgres=healthy"
  compose_print up -d --no-deps backup
  log "would wait for backup=healthy"
  "$SCRIPT_DIR/backup-now.sh" \
    --env-file "$ENV_FILE" \
    --compose-file "$COMPOSE_FILE" \
    --trigger pre-migration \
    --reason "before release $RELEASE_ID" \
    --release-id "$RELEASE_ID" \
    --git-commit "$GIT_COMMIT" \
    --skip-preflight \
    --dry-run
  compose_print run --rm --no-deps migrate
  compose_print up -d --no-deps api worker web
  log "would wait for api/web=healthy and worker=running"
  compose_print up -d --no-deps caddy
  log "would wait for caddy=running"
  "$SCRIPT_DIR/smoke.sh" --base-url "$PUBLIC_URL" --access-boundary "$ACCESS_BOUNDARY" --dry-run
  log "would write release record under $RECORD_DIR"
  exit 0
fi

mkdir -p "$RECORD_DIR"
STARTED_AT="$(now_utc)"
SNAPSHOT_ID=""
MIGRATION_APPLIED=false
DEPLOY_STATUS=running
RECORD_FILE="$RECORD_DIR/$RELEASE_ID.json"

write_record() {
  local status="$1"
  local completed_at="$2"
  local temporary="$RECORD_FILE.tmp.$$"
  jq -n \
    --arg format our-tomorrow-release \
    --argjson version 1 \
    --arg releaseId "$RELEASE_ID" \
    --arg status "$status" \
    --arg startedAt "$STARTED_AT" \
    --arg completedAt "$completed_at" \
    --arg gitCommit "$GIT_COMMIT" \
    --arg imageTag "$IMAGE_TAG" \
    --arg imageMode "$IMAGE_MODE" \
    --arg backupSnapshotId "$SNAPSHOT_ID" \
    --argjson migrationApplied "$MIGRATION_APPLIED" \
    --arg previousReleaseId "$PREVIOUS_RELEASE_ID" \
    --arg previousImageTag "$PREVIOUS_IMAGE_TAG" \
    --arg publicUrl "$PUBLIC_URL" \
    --arg accessBoundary "$ACCESS_BOUNDARY" \
    --arg operator "${DEPLOY_OPERATOR:-${USER:-unknown}}" \
    '{
      format: $format,
      version: $version,
      releaseId: $releaseId,
      status: $status,
      startedAt: $startedAt,
      completedAt: (if $completedAt == "" then null else $completedAt end),
      gitCommit: $gitCommit,
      imageTag: $imageTag,
      imageMode: $imageMode,
      backupSnapshotId: (if $backupSnapshotId == "" then null else $backupSnapshotId end),
      migrationApplied: $migrationApplied,
      previousReleaseId: (if $previousReleaseId == "" then null else $previousReleaseId end),
      previousImageTag: (if $previousImageTag == "" then null else $previousImageTag end),
      publicUrl: $publicUrl,
      accessBoundary: $accessBoundary,
      operator: $operator
    }' > "$temporary"
  chmod 0600 "$temporary"
  mv "$temporary" "$RECORD_FILE"
}

on_exit() {
  local status=$?
  if (( status != 0 )); then
    DEPLOY_STATUS=failed
    write_record failed "$(now_utc)" || true
    warn "release failed; evidence recorded at $RECORD_FILE"
    if [[ -n "$PREVIOUS_IMAGE_TAG" ]]; then
      warn "application-only rollback candidate: IMAGE_TAG=$PREVIOUS_IMAGE_TAG (release $PREVIOUS_RELEASE_ID)"
    fi
    if [[ "$MIGRATION_APPLIED" == true ]]; then
      warn "database migration ran: do not auto-downgrade; restore snapshot $SNAPSHOT_ID into a new project before traffic cutover"
    fi
  fi
}
trap on_exit EXIT

write_record running ""
log "starting release $RELEASE_ID"

if [[ "$IMAGE_MODE" == "build" && "$SKIP_BUILD" != true ]]; then
  compose build api web backup
elif [[ "$IMAGE_MODE" == "pull" ]]; then
  compose pull api worker web backup
fi

compose up -d --no-deps postgres
wait_for_service postgres healthy "$HEALTH_TIMEOUT"

compose up -d --no-deps backup
wait_for_service backup healthy "$HEALTH_TIMEOUT"

"$SCRIPT_DIR/backup-now.sh" \
  --env-file "$ENV_FILE" \
  --compose-file "$COMPOSE_FILE" \
  --trigger pre-migration \
  --reason "before release $RELEASE_ID" \
  --release-id "$RELEASE_ID" \
  --git-commit "$GIT_COMMIT" \
  --skip-preflight

SNAPSHOT_ID="$(compose exec -T backup cat /var/lib/backup/last-success.json | jq -er --arg release "$RELEASE_ID" 'select(.releaseId == $release) | .snapshotId')"
write_record running ""

compose run --rm --no-deps migrate
MIGRATION_APPLIED=true
write_record running ""

compose up -d --no-deps api worker web
wait_for_service api healthy "$HEALTH_TIMEOUT"
wait_for_service web healthy "$HEALTH_TIMEOUT"
wait_for_service worker running "$HEALTH_TIMEOUT"

compose up -d --no-deps caddy
wait_for_service caddy running "$HEALTH_TIMEOUT"

"$SCRIPT_DIR/smoke.sh" \
  --base-url "$PUBLIC_URL" \
  --access-boundary "$ACCESS_BOUNDARY"

COMPLETED_AT="$(now_utc)"
DEPLOY_STATUS=succeeded
write_record succeeded "$COMPLETED_AT"

CURRENT_TMP="$RECORD_DIR/current.env.tmp.$$"
{
  printf 'RELEASE_ID=%s\n' "$RELEASE_ID"
  printf 'IMAGE_TAG=%s\n' "$IMAGE_TAG"
  printf 'GIT_COMMIT=%s\n' "$GIT_COMMIT"
  printf 'BACKUP_SNAPSHOT_ID=%s\n' "$SNAPSHOT_ID"
  printf 'COMPLETED_AT=%s\n' "$COMPLETED_AT"
} > "$CURRENT_TMP"
chmod 0600 "$CURRENT_TMP"
mv "$CURRENT_TMP" "$RECORD_DIR/current.env"

trap - EXIT
log "release succeeded: $RELEASE_ID"
log "record: $RECORD_FILE"
log "pre-migration snapshot: $SNAPSHOT_ID"
