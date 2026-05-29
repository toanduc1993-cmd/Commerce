#!/usr/bin/env bash
# audit_log_cleanup.sh — S2-4: Delete AuditLog rows older than 90 days
# Schedule: weekly via launchd (com.ibshi.vattu.auditlogcleanup.plist)
# Log: /tmp/vattu-audit-cleanup.log
set -euo pipefail

RETENTION_DAYS="${RETENTION_DAYS:-90}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_PREFIX="[audit-cleanup ${TS}]"

# Load .env (DATABASE_URL)
if [[ -f "$(dirname "$0")/../backend/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$(dirname "$0")/../backend/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "${LOG_PREFIX} ERROR: DATABASE_URL not set"
  exit 1
fi

# Extract connection details (assume URL format postgresql://user:pass@host:port/db)
# Use psql directly with URL
PSQL="/opt/homebrew/opt/postgresql@18/bin/psql"
[[ -x "$PSQL" ]] || PSQL="psql"

# Count rows before
BEFORE=$("$PSQL" "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days'")
echo "${LOG_PREFIX} Rows older than ${RETENTION_DAYS}d: ${BEFORE}"

if [[ "${BEFORE}" -eq 0 ]]; then
  echo "${LOG_PREFIX} Nothing to delete"
  exit 0
fi

# Delete
DELETED=$("$PSQL" "$DATABASE_URL" -t -A -c "WITH d AS (DELETE FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days' RETURNING 1) SELECT COUNT(*) FROM d")
echo "${LOG_PREFIX} Deleted: ${DELETED} rows"

# Vacuum to reclaim space
"$PSQL" "$DATABASE_URL" -c "VACUUM (ANALYZE) \"AuditLog\"" >/dev/null
echo "${LOG_PREFIX} VACUUM ANALYZE done"
