#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DATABASE_PATH:?Set DATABASE_PATH to the live database absolute path}"
: "${BACKUP_DIRECTORY:?Set BACKUP_DIRECTORY to a dedicated absolute directory}"
if [[ "$DATABASE_PATH" != /* || "$BACKUP_DIRECTORY" != /* ]]; then
  echo 'DATABASE_PATH and BACKUP_DIRECTORY must be absolute paths' >&2
  exit 1
fi
research_data_dir="$(dirname -- "$(realpath -m -- "$DATABASE_PATH")")"
research_backup_dir="$(realpath -m -- "$BACKUP_DIRECTORY")"
case "$research_backup_dir/" in
  "$research_data_dir/"*) echo 'Backup directory must be outside the live data directory' >&2; exit 1 ;;
esac
research_project_dir="$(dirname -- "$(dirname -- "$(realpath -- "${BASH_SOURCE[0]}")")")"
mkdir -p -- "$research_backup_dir"
research_snapshot="$research_backup_dir/research-$(date -u +%Y%m%dT%H%M%SZ)-$$.sqlite"
cd -- "$research_project_dir"
exec "${NODE_BINARY:-node}" --import tsx scripts/backup.ts "$research_snapshot"
