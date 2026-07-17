#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

ENV_FILE="$REPO_ROOT/infra/.env"
COMPOSE_FILE="$REPO_ROOT/infra/compose.yaml"
MODE=production
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: infra/scripts/preflight.sh [options]

Read-only deployment checks. No container or remote state is changed.

Options:
  --env-file PATH       Compose environment file (default: infra/.env)
  --compose-file PATH   Compose file (default: infra/compose.yaml)
  --mode MODE           production or local (default: production)
  --dry-run             Skip Docker daemon reachability; still validate config
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
    --mode)
      MODE="${2:?missing value for --mode}"
      shift 2
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

[[ "$MODE" == "production" || "$MODE" == "local" ]] || die "--mode must be production or local"
[[ -f "$ENV_FILE" ]] || die "environment file not found: $ENV_FILE"
[[ -f "$COMPOSE_FILE" ]] || die "compose file not found: $COMPOSE_FILE"

require_command awk
require_command curl
require_command docker
require_command jq

docker compose version >/dev/null
if [[ "$DRY_RUN" != true ]]; then
  docker info >/dev/null 2>&1 || die "Docker daemon is not reachable"
fi

NODE_ENV_VALUE="$(env_or_default NODE_ENV "$ENV_FILE" development)"
APP_SITE_ADDRESS="$(env_or_default APP_SITE_ADDRESS "$ENV_FILE" http://localhost)"
PUBLIC_APP_URL="$(env_or_default PUBLIC_APP_URL "$ENV_FILE" http://localhost)"
WEB_ORIGIN="$(env_or_default WEB_ORIGIN "$ENV_FILE" http://localhost)"
ACCESS_BOUNDARY="$(env_or_default ACCESS_BOUNDARY "$ENV_FILE" '')"
PRIVATE_ACCESS_ACKNOWLEDGED="$(env_or_default PRIVATE_ACCESS_ACKNOWLEDGED "$ENV_FILE" false)"
CADDY_BIND_ADDRESS="$(env_or_default CADDY_BIND_ADDRESS "$ENV_FILE" 127.0.0.1)"
BACKUP_OFFSITE_ACKNOWLEDGED="$(env_or_default BACKUP_OFFSITE_ACKNOWLEDGED "$ENV_FILE" false)"
RESTIC_REPOSITORY_VALUE="$(env_or_default RESTIC_REPOSITORY "$ENV_FILE" /backups/restic)"

case "$ACCESS_BOUNDARY" in
  private-interface | upstream-access-proxy) ;;
  *) die "ACCESS_BOUNDARY must be private-interface or upstream-access-proxy" ;;
esac

if [[ "$MODE" == "production" ]]; then
  [[ "$NODE_ENV_VALUE" == "production" ]] || die "NODE_ENV must be production"
  [[ "$PUBLIC_APP_URL" == https://* ]] || die "PUBLIC_APP_URL must use HTTPS"
  [[ "$WEB_ORIGIN" == "$PUBLIC_APP_URL" ]] || die "WEB_ORIGIN must exactly match PUBLIC_APP_URL"
  [[ "$PRIVATE_ACCESS_ACKNOWLEDGED" == "true" ]] || die "set PRIVATE_ACCESS_ACKNOWLEDGED=true after verifying the two-person access boundary"
  [[ "$BACKUP_OFFSITE_ACKNOWLEDGED" == "true" ]] || die "set BACKUP_OFFSITE_ACKNOWLEDGED=true after verifying an independent off-host Restic copy"
  [[ "$CADDY_BIND_ADDRESS" != "0.0.0.0" && "$CADDY_BIND_ADDRESS" != "::" && "$CADDY_BIND_ADDRESS" != "*" ]] || die "Caddy must bind an explicit loopback/private interface, not a wildcard"

  if [[ "$ACCESS_BOUNDARY" == "upstream-access-proxy" ]]; then
    [[ "$CADDY_BIND_ADDRESS" == "127.0.0.1" ]] || die "upstream-access-proxy requires CADDY_BIND_ADDRESS=127.0.0.1"
  else
    [[ "$APP_SITE_ADDRESS" == https://* ]] || die "private-interface deployments require Caddy to terminate HTTPS"
  fi

  POSTGRES_PASSWORD_VALUE="$(env_or_default POSTGRES_PASSWORD "$ENV_FILE" '')"
  BACKUP_ENCRYPTION_KEY_VALUE="$(env_or_default BACKUP_ENCRYPTION_KEY "$ENV_FILE" '')"
  DATABASE_URL_VALUE="$(env_or_default DATABASE_URL "$ENV_FILE" '')"
  BACKUP_DATABASE_URL_VALUE="$(env_or_default BACKUP_DATABASE_URL "$ENV_FILE" '')"
  IMAGE_TAG_VALUE="$(env_or_default IMAGE_TAG "$ENV_FILE" local)"
  RESTIC_CHECK_REPOSITORY_VALUE="$(env_or_default RESTIC_CHECK_REPOSITORY "$ENV_FILE" true)"

  is_placeholder_secret "$POSTGRES_PASSWORD_VALUE" && die "POSTGRES_PASSWORD still uses an empty/example value"
  is_placeholder_secret "$BACKUP_ENCRYPTION_KEY_VALUE" && die "BACKUP_ENCRYPTION_KEY still uses an empty/example value"
  [[ "$DATABASE_URL_VALUE" != *our_tomorrow:our_tomorrow* && "$DATABASE_URL_VALUE" != *url-encoded-password* ]] || die "DATABASE_URL still uses example credentials"
  [[ "$BACKUP_DATABASE_URL_VALUE" != *our_tomorrow:our_tomorrow* && "$BACKUP_DATABASE_URL_VALUE" != *url-encoded-password* ]] || die "BACKUP_DATABASE_URL still uses example credentials"
  [[ "$IMAGE_TAG_VALUE" != "local" && "$IMAGE_TAG_VALUE" != "latest" ]] || warn "IMAGE_TAG in the env file is mutable/example; deploy.sh must receive an immutable --image-tag"
  [[ "$RESTIC_REPOSITORY_VALUE" != "/backups/restic" ]] || warn "RESTIC_REPOSITORY is local; the acknowledged off-host copy must be independently monitored"
  [[ "$RESTIC_CHECK_REPOSITORY_VALUE" == "true" ]] || die "RESTIC_CHECK_REPOSITORY must remain true in production"
fi

CONFIG_JSON="$(mktemp "${TMPDIR:-/tmp}/our-tomorrow-compose.XXXXXX")"
cleanup() {
  rm -f "$CONFIG_JSON"
}
trap cleanup EXIT

compose config --quiet
compose config --format json > "$CONFIG_JSON"

jq -e '.networks.data.internal == true' "$CONFIG_JSON" >/dev/null || die "the data network must remain internal"
jq -e '.services.postgres.ports | length > 0 and all(.host_ip == "127.0.0.1")' "$CONFIG_JSON" >/dev/null || die "PostgreSQL may only be published on 127.0.0.1"
jq -e --arg bind "$CADDY_BIND_ADDRESS" '.services.caddy.ports | length > 0 and all(.host_ip == $bind)' "$CONFIG_JSON" >/dev/null || die "Caddy published ports do not match CADDY_BIND_ADDRESS"
jq -e '.services.api.security_opt[]? == "no-new-privileges:true"' "$CONFIG_JSON" >/dev/null || die "API no-new-privileges hardening is missing"
jq -e '.services.api.read_only == true and .services.web.read_only == true and .services.backup.read_only == true' "$CONFIG_JSON" >/dev/null || die "runtime services must retain read-only root filesystems"

log "preflight passed ($MODE): config valid, data network private, database loopback-only"
log "access boundary: $ACCESS_BOUNDARY; Caddy bind: $CADDY_BIND_ADDRESS; public URL: $PUBLIC_APP_URL"
if [[ "$DRY_RUN" == true ]]; then
  log "dry-run: Docker daemon state was not inspected"
fi
