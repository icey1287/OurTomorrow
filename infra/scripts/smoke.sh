#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

ENV_FILE="$REPO_ROOT/infra/.env"
BASE_URL=""
ACCESS_BOUNDARY=""
ALLOW_HTTP=false
DRY_RUN=false
CONNECT_TIMEOUT=10
MAX_TIME=30

usage() {
  cat <<'EOF'
Usage: infra/scripts/smoke.sh [options]

Verify health, TLS/security headers, and the fixed boy/girl shared Couple.
The identity requests are idempotent and do not create a session or cookie.

Options:
  --env-file PATH          Read PUBLIC_APP_URL and ACCESS_BOUNDARY from PATH
  --base-url URL           Override the public base URL
  --access-boundary NAME   private-interface or upstream-access-proxy
  --allow-http             Permit HTTP only for localhost restore drills/tests
  --dry-run                Print checks without making requests
  -h, --help               Show this help
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --env-file)
      ENV_FILE="$(absolute_from_repo "${2:?missing value for --env-file}")"
      shift 2
      ;;
    --base-url)
      BASE_URL="${2:?missing value for --base-url}"
      shift 2
      ;;
    --access-boundary)
      ACCESS_BOUNDARY="${2:?missing value for --access-boundary}"
      shift 2
      ;;
    --allow-http)
      ALLOW_HTTP=true
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

if [[ -f "$ENV_FILE" ]]; then
  [[ -n "$BASE_URL" ]] || BASE_URL="$(env_or_default PUBLIC_APP_URL "$ENV_FILE" '')"
  [[ -n "$ACCESS_BOUNDARY" ]] || ACCESS_BOUNDARY="$(env_or_default ACCESS_BOUNDARY "$ENV_FILE" '')"
fi

BASE_URL="${BASE_URL%/}"
[[ -n "$BASE_URL" ]] || die "a base URL is required"
case "$ACCESS_BOUNDARY" in
  private-interface | upstream-access-proxy | restore-drill | local-test) ;;
  *) die "an explicit access boundary is required" ;;
esac

HTTPS=false
if [[ "$BASE_URL" == https://* ]]; then
  HTTPS=true
elif [[ "$BASE_URL" == http://127.0.0.1:* || "$BASE_URL" == http://localhost:* || "$BASE_URL" == "http://127.0.0.1" || "$BASE_URL" == "http://localhost" ]]; then
  [[ "$ALLOW_HTTP" == true ]] || die "HTTP is only permitted with --allow-http for localhost checks"
else
  die "non-local smoke tests must use HTTPS"
fi

if [[ "$DRY_RUN" == true ]]; then
  log "dry-run smoke target: $BASE_URL"
  log "would check Web/API health, TLS, CSP and security headers"
  log "would select boy and girl and require distinct users in the same Couple without Set-Cookie"
  exit 0
fi

require_command curl
require_command jq

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/our-tomorrow-smoke.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

CURL_COMMON=(
  --silent
  --show-error
  --connect-timeout "$CONNECT_TIMEOUT"
  --max-time "$MAX_TIME"
  --retry 2
  --retry-delay 1
)
if [[ "$HTTPS" == true ]]; then
  CURL_COMMON+=(--proto '=https' --tlsv1.2)
fi

request() {
  local name="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local role="${5:-}"
  local status
  local args=("${CURL_COMMON[@]}" --request "$method" --dump-header "$TMP_DIR/$name.headers" --output "$TMP_DIR/$name.body" --write-out '%{http_code}')

  [[ -z "$role" ]] || args+=(--header "X-Our-Tomorrow-Role: $role")
  if [[ -n "$body" ]]; then
    args+=(--header 'Content-Type: application/json' --data "$body")
  fi
  status="$(curl "${args[@]}" "$BASE_URL$path")" || die "request failed: $method $path"
  [[ "$status" == "200" ]] || die "$method $path returned HTTP $status"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v expected="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    {
      line = $0
      sub(/\r$/, "", line)
      separator = index(line, ":")
      if (separator == 0) next
      header = tolower(substr(line, 1, separator - 1))
      if (header == expected) {
        value = substr(line, separator + 1)
        sub(/^[[:space:]]+/, "", value)
      }
    }
    END { print value }
  ' "$file"
}

require_header_contains() {
  local file="$1"
  local name="$2"
  local expected="$3"
  local value
  value="$(header_value "$file" "$name")"
  [[ "$value" == *"$expected"* ]] || die "$name is missing required value: $expected"
}

reject_header() {
  local file="$1"
  local name="$2"
  [[ -z "$(header_value "$file" "$name")" ]] || die "$name must not be returned"
}

request web GET /
request web_health GET /healthz
request live GET /api/v1/health/live
request ready GET /api/v1/health/ready

require_header_contains "$TMP_DIR/web.headers" Content-Security-Policy "default-src 'self'"
require_header_contains "$TMP_DIR/web.headers" Content-Security-Policy "frame-ancestors 'none'"
require_header_contains "$TMP_DIR/web.headers" Permissions-Policy 'camera=()'
require_header_contains "$TMP_DIR/web.headers" Referrer-Policy 'no-referrer'
require_header_contains "$TMP_DIR/web.headers" X-Content-Type-Options 'nosniff'
require_header_contains "$TMP_DIR/web.headers" X-Frame-Options 'DENY'
if [[ "$HTTPS" == true ]]; then
  require_header_contains "$TMP_DIR/web.headers" Strict-Transport-Security 'max-age='
fi

request boy POST /api/v1/identity/select '{"role":"boy"}'
request girl POST /api/v1/identity/select '{"role":"girl"}'
reject_header "$TMP_DIR/boy.headers" Set-Cookie
reject_header "$TMP_DIR/girl.headers" Set-Cookie

jq -e '
  .role == "boy"
  and .user.role == "boy"
  and (.user.id | type == "string" and length > 0)
  and (.couple.id | type == "string" and length > 0)
  and ([.couple.members[].role] | sort == ["boy", "girl"])
  and (has("token") | not)
  and (has("accessToken") | not)
  and (has("session") | not)
' "$TMP_DIR/boy.body" >/dev/null || die "boy identity response violates the fixed two-person contract"

jq -e '
  .role == "girl"
  and .user.role == "girl"
  and (.user.id | type == "string" and length > 0)
  and (.couple.id | type == "string" and length > 0)
  and ([.couple.members[].role] | sort == ["boy", "girl"])
  and (has("token") | not)
  and (has("accessToken") | not)
  and (has("session") | not)
' "$TMP_DIR/girl.body" >/dev/null || die "girl identity response violates the fixed two-person contract"

BOY_COUPLE_ID="$(jq -er '.couple.id' "$TMP_DIR/boy.body")"
GIRL_COUPLE_ID="$(jq -er '.couple.id' "$TMP_DIR/girl.body")"
BOY_USER_ID="$(jq -er '.user.id' "$TMP_DIR/boy.body")"
GIRL_USER_ID="$(jq -er '.user.id' "$TMP_DIR/girl.body")"
[[ "$BOY_COUPLE_ID" == "$GIRL_COUPLE_ID" ]] || die "boy and girl resolved to different Couple IDs"
[[ "$BOY_USER_ID" != "$GIRL_USER_ID" ]] || die "boy and girl resolved to the same user"

request boy_current GET /api/v1/couples/current '' boy
request girl_current GET /api/v1/couples/current '' girl
reject_header "$TMP_DIR/boy_current.headers" Set-Cookie
reject_header "$TMP_DIR/girl_current.headers" Set-Cookie
[[ "$(jq -er '.id' "$TMP_DIR/boy_current.body")" == "$BOY_COUPLE_ID" ]] || die "boy current Couple changed during smoke"
[[ "$(jq -er '.id' "$TMP_DIR/girl_current.body")" == "$BOY_COUPLE_ID" ]] || die "girl current Couple changed during smoke"

log "smoke passed: health, security headers, and fixed two-person Couple are healthy"
log "verified access boundary declaration: $ACCESS_BOUNDARY"
