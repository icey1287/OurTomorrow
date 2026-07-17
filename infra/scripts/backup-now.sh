#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

ENV_FILE="$REPO_ROOT/infra/.env"
COMPOSE_FILE="$REPO_ROOT/infra/compose.yaml"
DRY_RUN=false
SKIP_PREFLIGHT=false
TRIGGER=manual
REASON=operator-requested
RELEASE_ID="manual-$(date -u +%Y%m%dT%H%M%SZ)"
GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"

usage() {
  cat <<'EOF'
Usage: infra/scripts/backup-now.sh [options]

Create and verify one encrypted database + media Restic snapshot.

Options:
  --env-file PATH       Compose environment file (default: infra/.env)
  --compose-file PATH   Compose file (default: infra/compose.yaml)
  --trigger NAME        manual or pre-migration (default: manual)
  --reason TEXT         Short release/operation reason (no private content)
  --release-id ID       Release/change identifier recorded in metadata
  --git-commit SHA      Commit recorded in metadata (default: current HEAD)
  --skip-preflight      Internal: caller already completed production preflight
  --dry-run             Print commands without starting a backup
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
    --trigger)
      TRIGGER="${2:?missing value for --trigger}"
      shift 2
      ;;
    --reason)
      REASON="${2:?missing value for --reason}"
      shift 2
      ;;
    --release-id)
      RELEASE_ID="${2:?missing value for --release-id}"
      shift 2
      ;;
    --git-commit)
      GIT_COMMIT="${2:?missing value for --git-commit}"
      shift 2
      ;;
    --skip-preflight)
      SKIP_PREFLIGHT=true
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

[[ "$TRIGGER" == "manual" || "$TRIGGER" == "pre-migration" ]] || die "--trigger must be manual or pre-migration"
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._:-]{3,128}$ ]] || die "--release-id contains unsupported characters"
[[ "$GIT_COMMIT" =~ ^[A-Za-z0-9._-]{3,128}$ ]] || die "--git-commit contains unsupported characters"
[[ "$REASON" != *$'\n'* && ${#REASON} -le 160 ]] || die "--reason must be a single line of at most 160 characters"
LOCK_WAIT_SECONDS="$(env_or_default DEPLOY_HEALTH_TIMEOUT_SECONDS "$ENV_FILE" 300)"
[[ "$LOCK_WAIT_SECONDS" =~ ^[0-9]+$ ]] || die "DEPLOY_HEALTH_TIMEOUT_SECONDS must be numeric"

if [[ "$SKIP_PREFLIGHT" != true ]]; then
  preflight_args=(--env-file "$ENV_FILE" --compose-file "$COMPOSE_FILE" --mode production)
  [[ "$DRY_RUN" == true ]] && preflight_args+=(--dry-run)
  "$SCRIPT_DIR/preflight.sh" "${preflight_args[@]}"
fi

if [[ "$DRY_RUN" == true ]]; then
  compose_print exec -T \
    -e "BACKUP_TRIGGER=$TRIGGER" \
    -e "BACKUP_REASON=$REASON" \
    -e "BACKUP_RELEASE_ID=$RELEASE_ID" \
    -e "BACKUP_GIT_COMMIT=$GIT_COMMIT" \
    -e "BACKUP_LOCK_WAIT_SECONDS=$LOCK_WAIT_SECONDS" \
    backup /usr/local/bin/backup.sh
  compose_print exec -T backup cat /var/lib/backup/last-success.json
  compose_print exec -T backup restic snapshots --tag our-tomorrow --latest 1
  log "dry-run: no snapshot was created"
  exit 0
fi

running_services="$(compose ps --status running --services)"
grep -qx backup <<< "$running_services" || die "backup service is not running"

log "creating $TRIGGER backup for release $RELEASE_ID"
compose exec -T \
  -e "BACKUP_TRIGGER=$TRIGGER" \
  -e "BACKUP_REASON=$REASON" \
  -e "BACKUP_RELEASE_ID=$RELEASE_ID" \
  -e "BACKUP_GIT_COMMIT=$GIT_COMMIT" \
  -e "BACKUP_LOCK_WAIT_SECONDS=$LOCK_WAIT_SECONDS" \
  backup /usr/local/bin/backup.sh

SUCCESS_JSON="$(compose exec -T backup cat /var/lib/backup/last-success.json)"
SNAPSHOT_ID="$(jq -er --arg release "$RELEASE_ID" '
  select(.status == "succeeded")
  | select(.releaseId == $release)
  | .snapshotId
  | strings
  | select(length > 0)
' <<< "$SUCCESS_JSON")" || die "backup completed without a matching success record"

compose exec -T backup restic snapshots "$SNAPSHOT_ID" --json \
  | jq -e --arg snapshot "$SNAPSHOT_ID" 'length == 1 and .[0].short_id == $snapshot[0:8]' >/dev/null \
  || die "Restic cannot read back snapshot $SNAPSHOT_ID"

log "verified backup snapshot: $SNAPSHOT_ID"
printf '%s\n' "$SNAPSHOT_ID"
