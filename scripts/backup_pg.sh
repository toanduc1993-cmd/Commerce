#!/usr/bin/env bash
# backup_pg.sh — S3-2: Daily PostgreSQL backup with 30-day retention
# Schedule: daily 02:00 via launchd (com.ibshi.vattu.backuppg.plist)
# Local: backups/YYYYMMDD_HHMM.sql.gz (30-day retention)
# Remote: optional rsync to NAS (7-day retention) — set REMOTE_BACKUP_DIR env
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-7}"
TS="$(date +%Y%m%d_%H%M)"
LOG_PREFIX="[backup-pg ${TS}]"

mkdir -p "${BACKUP_DIR}"

# Load .env
if [[ -f "${PROJECT_ROOT}/backend/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${PROJECT_ROOT}/backend/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "${LOG_PREFIX} ERROR: DATABASE_URL not set"
  exit 1
fi

PG_DUMP="/opt/homebrew/opt/postgresql@18/bin/pg_dump"
[[ -x "$PG_DUMP" ]] || PG_DUMP="pg_dump"

OUT_FILE="${BACKUP_DIR}/${TS}.sql.gz"

echo "${LOG_PREFIX} Starting pg_dump → ${OUT_FILE}"
START=$(date +%s)

"$PG_DUMP" "$DATABASE_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --quote-all-identifiers \
  | gzip -9 > "${OUT_FILE}"

SIZE=$(du -h "${OUT_FILE}" | awk '{print $1}')
DURATION=$(( $(date +%s) - START ))
echo "${LOG_PREFIX} Done in ${DURATION}s, size ${SIZE}"

# Verify backup is valid (check first line of decompressed)
if ! gzip -t "${OUT_FILE}"; then
  echo "${LOG_PREFIX} ERROR: backup file corrupt"
  rm -f "${OUT_FILE}"
  exit 1
fi

# Local retention: delete files older than RETENTION_DAYS
echo "${LOG_PREFIX} Cleanup local backups older than ${RETENTION_DAYS}d"
find "${BACKUP_DIR}" -maxdepth 1 -name "*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete -print | while read -r f; do
  echo "${LOG_PREFIX}   removed: $(basename "$f")"
done

# Optional: rsync to remote NAS
if [[ -n "${REMOTE_BACKUP_DIR:-}" ]]; then
  echo "${LOG_PREFIX} Syncing to ${REMOTE_BACKUP_DIR}"
  rsync -av --delete-after \
    --include='*.sql.gz' \
    --exclude='*' \
    "${BACKUP_DIR}/" "${REMOTE_BACKUP_DIR}/" || {
    echo "${LOG_PREFIX} WARN: remote sync failed (non-fatal)"
  }
  # Remote retention (find via ssh requires REMOTE_HOST setup — skip for now, NAS-side cron)
fi

echo "${LOG_PREFIX} Backup successful"
