#!/usr/bin/env bash
# uploads_archive.sh — S3-3: Move files >6 months from uploads/ to archive/
# Schedule: monthly first Sunday via launchd
# Disk quota alert if uploads/ > QUOTA_MB
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
UPLOADS_DIR="${UPLOADS_DIR:-${PROJECT_ROOT}/backend/uploads}"
ARCHIVE_DIR="${ARCHIVE_DIR:-${PROJECT_ROOT}/backend/archive}"
RETENTION_MONTHS="${RETENTION_MONTHS:-6}"
QUOTA_MB="${QUOTA_MB:-5000}"   # 5GB default
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_PREFIX="[uploads-archive ${TS}]"

if [[ ! -d "${UPLOADS_DIR}" ]]; then
  echo "${LOG_PREFIX} uploads/ not found: ${UPLOADS_DIR}"
  exit 0
fi

mkdir -p "${ARCHIVE_DIR}"

# Convert months to days (approximate)
RETENTION_DAYS=$(( RETENTION_MONTHS * 30 ))

# Find old files
COUNT=$(find "${UPLOADS_DIR}" -type f -mtime "+${RETENTION_DAYS}" | wc -l | tr -d ' ')
echo "${LOG_PREFIX} Found ${COUNT} files older than ${RETENTION_MONTHS} months"

if [[ "${COUNT}" -gt 0 ]]; then
  # Preserve subdir structure under archive/
  find "${UPLOADS_DIR}" -type f -mtime "+${RETENTION_DAYS}" -print0 | while IFS= read -r -d '' f; do
    rel="${f#"${UPLOADS_DIR}"/}"
    target="${ARCHIVE_DIR}/${rel}"
    mkdir -p "$(dirname "${target}")"
    mv "${f}" "${target}"
  done
  echo "${LOG_PREFIX} Moved ${COUNT} files to ${ARCHIVE_DIR}"
fi

# Quota check
SIZE_MB=$(du -sm "${UPLOADS_DIR}" | awk '{print $1}')
echo "${LOG_PREFIX} uploads/ size: ${SIZE_MB} MB (quota ${QUOTA_MB} MB)"

if [[ "${SIZE_MB}" -gt "${QUOTA_MB}" ]]; then
  echo "${LOG_PREFIX} ⚠️ QUOTA EXCEEDED — uploads/ ${SIZE_MB}MB > ${QUOTA_MB}MB"
  # Send macOS notification
  if command -v osascript >/dev/null; then
    osascript -e "display notification \"uploads/ at ${SIZE_MB}MB / ${QUOTA_MB}MB quota\" with title \"IBSHI Disk Alert\""
  fi
  exit 2
fi

echo "${LOG_PREFIX} OK"
