#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

scripts=(
  "$REPO_ROOT/infra/backup/backup.sh"
  "$REPO_ROOT/infra/backup/entrypoint.sh"
  "$REPO_ROOT/infra/scripts/common.sh"
  "$REPO_ROOT/infra/scripts/preflight.sh"
  "$REPO_ROOT/infra/scripts/backup-now.sh"
  "$REPO_ROOT/infra/scripts/deploy.sh"
  "$REPO_ROOT/infra/scripts/smoke.sh"
  "$REPO_ROOT/infra/scripts/restore-drill.sh"
  "$REPO_ROOT/infra/tests/scripts-smoke.sh"
  "$REPO_ROOT/infra/tests/local-restore-drill.sh"
  "$REPO_ROOT/infra/tests/local-restore-drill-offline.sh"
)
posix_scripts=("$REPO_ROOT/infra/backup/healthcheck.sh")

for script in "${scripts[@]}"; do
  [[ -f "$script" ]] || {
    printf 'missing shell script: %s\n' "$script" >&2
    exit 1
  }
  bash -n "$script"
  [[ -x "$script" ]] || {
    printf 'shell script is not executable: %s\n' "$script" >&2
    exit 1
  }
done

for script in "${posix_scripts[@]}"; do
  [[ -f "$script" ]] || {
    printf 'missing shell script: %s\n' "$script" >&2
    exit 1
  }
  sh -n "$script"
  [[ -x "$script" ]] || {
    printf 'shell script is not executable: %s\n' "$script" >&2
    exit 1
  }
done

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x "${scripts[@]}" "${posix_scripts[@]}"
else
  printf 'shellcheck not installed; bash -n and executable checks completed\n'
fi

printf 'shell static checks passed (%s Bash, %s POSIX scripts)\n' "${#scripts[@]}" "${#posix_scripts[@]}"
