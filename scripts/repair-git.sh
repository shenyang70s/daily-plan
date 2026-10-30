#!/usr/bin/env bash
# Run on the host with access to the real .git. Never pushes or replaces source files.
set -euo pipefail
umask 077
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
remote_url="${1:-}"
if [[ -z "$remote_url" ]]; then
  printf 'Usage: bash scripts/repair-git.sh <daily-plan GitHub repository URL>\n' >&2
  exit 2
fi
case "$remote_url" in
  https://github.com/*/daily-plan.git|https://github.com/*/daily-plan|git@github.com:*/daily-plan.git) ;;
  *) printf 'Expected a GitHub repository named daily-plan; refusing to configure another repository.\n' >&2; exit 2 ;;
esac
# The agent sandbox masks .git with an empty read-only mount. Do not route around it.
if command -v findmnt >/dev/null 2>&1; then
  mount_target="$(findmnt -n -T "$project_root/.git" -o TARGET 2>/dev/null || true)"
  mount_options="$(findmnt -n -T "$project_root/.git" -o OPTIONS 2>/dev/null || true)"
  if [[ "$mount_target" == "$project_root/.git" && ",${mount_options}," == *,ro,* ]]; then
    printf 'The root .git is hidden by a read-only mount. Run this script in the host terminal.\n' >&2
    exit 3
  fi
fi
if [[ -e "$project_root/prototype/.git" ]]; then
  printf 'A nested prototype/.git still exists. Preserve and remove that association before continuing.\n' >&2
  exit 3
fi
# Validate the intended repository before modifying existing local Git configuration.
git ls-remote "$remote_url" > /dev/null
recovery_root="$project_root/.git-recovery/root-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p -- "$recovery_root"
repo_root="$(git -C "$project_root" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ "$repo_root" == "$project_root" ]]; then
  # Preserve all local history and index state; only repair origin and refresh remote refs.
  config_path="$(git -C "$project_root" rev-parse --path-format=absolute --git-path config)"
  cp -- "$config_path" "$recovery_root/config.before"
  git -C "$project_root" remote -v > "$recovery_root/remotes.before"
  if git -C "$project_root" remote get-url origin > /dev/null 2>&1; then
    git -C "$project_root" remote set-url origin "$remote_url"
  else
    git -C "$project_root" remote add origin "$remote_url"
  fi
  if git -C "$project_root" config --local --get-all remote.origin.pushurl > /dev/null; then
    git -C "$project_root" config --local --unset-all remote.origin.pushurl
  fi
  git -C "$project_root" fetch --prune origin
else
  # Restore metadata from the intended remote, preserving the entire current working tree.
  git clone --no-checkout --origin origin -- "$remote_url" "$recovery_root/checkout"
  if [[ -e "$project_root/.git" || -L "$project_root/.git" ]]; then
    mv -- "$project_root/.git" "$recovery_root/root.git.before"
  fi
  mv -- "$recovery_root/checkout/.git" "$project_root/.git"
  rmdir -- "$recovery_root/checkout"
  if git -C "$project_root" rev-parse --verify HEAD > /dev/null 2>&1; then
    # Populate the newly cloned index only. No checkout/reset/clean of working files.
    git -C "$project_root" read-tree HEAD
  fi
fi
printf '\nLocal Git metadata repaired. No source files were replaced and nothing was pushed.\n'
git -C "$project_root" rev-parse --show-toplevel
git -C "$project_root" remote -v
git -C "$project_root" status --short
