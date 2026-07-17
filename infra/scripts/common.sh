#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
  printf '[our-tomorrow] %s\n' "$*"
}

warn() {
  printf '[our-tomorrow] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[our-tomorrow] ERROR: %s\n' "$*" >&2
  exit 1
}

now_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

env_value() {
  local key="$1"
  local file="$2"
  local line

  [[ -f "$file" ]] || return 1
  line="$(awk -v key="$key" '
    /^[[:space:]]*#/ { next }
    {
      candidate = $0
      sub(/^[[:space:]]*export[[:space:]]+/, "", candidate)
      if (index(candidate, key "=") == 1) value = substr(candidate, length(key) + 2)
    }
    END { if (value != "") print value }
  ' "$file")"
  line="${line%$'\r'}"
  if [[ "$line" == \"*\" && "$line" == *\" ]]; then
    line="${line:1:${#line}-2}"
  elif [[ "$line" == \'*\' && "$line" == *\' ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "$line"
}

env_or_default() {
  local key="$1"
  local file="$2"
  local fallback="$3"
  local value

  value="$(env_value "$key" "$file" || true)"
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    printf '%s' "$fallback"
  fi
}

absolute_from_repo() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    printf '%s' "$path"
  else
    printf '%s/%s' "$REPO_ROOT" "$path"
  fi
}

print_command() {
  local argument
  printf '+ '
  for argument in "$@"; do
    printf '%q ' "$argument"
  done
  printf '\n'
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose_print() {
  print_command docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_service() {
  local service="$1"
  local expected="$2"
  local timeout_seconds="$3"
  local started_at
  local container_id
  local state

  started_at="$(date +%s)"
  while true; do
    container_id="$(compose ps -q "$service" 2>/dev/null | head -n 1)"
    if [[ -n "$container_id" ]]; then
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$state" == "$expected" ]]; then
        log "$service reached $expected"
        return 0
      fi
      if [[ "$state" == "exited" || "$state" == "dead" || "$state" == "unhealthy" ]]; then
        compose logs --tail 80 "$service" >&2 || true
        die "$service entered terminal state: $state"
      fi
    else
      state="not-created"
    fi

    if (( $(date +%s) - started_at >= timeout_seconds )); then
      compose ps "$service" >&2 || true
      compose logs --tail 80 "$service" >&2 || true
      die "timed out after ${timeout_seconds}s waiting for $service=$expected (last state: $state)"
    fi
    sleep 2
  done
}

is_placeholder_secret() {
  local value="$1"
  case "$value" in
    "" | our_tomorrow | development-only-change-me | replace-with-* | *url-encoded-password* | *change-me* | *example*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}
