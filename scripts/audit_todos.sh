#!/bin/bash
# audit_todos.sh — Grep TODO/FIXME/HACK trong codebase, flag stale >30 days
# Usage: ./scripts/audit_todos.sh
# Output: stdout table + exit code (0 = clean, 1 = stale found)
#
# Roadmap Phase 0.3, B-CPVT-004

set -euo pipefail
cd "$(dirname "$0")/.."

SCAN_DIRS=("backend/src" "frontend/src" "scripts")
PATTERNS="TODO|FIXME|HACK|XXX|@deprecated"
CUTOFF_DAYS=30

echo "🔍 Scanning ${SCAN_DIRS[@]} for: $PATTERNS"
echo "Cutoff stale: >$CUTOFF_DAYS days"
echo ""

count_total=0
count_stale=0
declare -a stale_entries=()

for dir in "${SCAN_DIRS[@]}"; do
  [ -d "$dir" ] || continue
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    file=$(echo "$line" | cut -d: -f1)
    lineno=$(echo "$line" | cut -d: -f2)
    content=$(echo "$line" | cut -d: -f3-)
    count_total=$((count_total+1))

    # Get file mtime in days ago
    if [ -f "$file" ]; then
      mtime=$(stat -f "%m" "$file" 2>/dev/null || echo 0)
      now=$(date +%s)
      age_days=$(( (now - mtime) / 86400 ))
      if [ "$age_days" -gt "$CUTOFF_DAYS" ]; then
        count_stale=$((count_stale+1))
        stale_entries+=("$file:$lineno (age ${age_days}d): $(echo "$content" | sed 's/^[[:space:]]*//' | cut -c1-80)")
      fi
    fi
  done < <(grep -rnE "$PATTERNS" "$dir" 2>/dev/null | grep -v "node_modules" | grep -v ".next" || true)
done

echo "📊 Summary"
echo "  Total TODO/FIXME/HACK markers: $count_total"
echo "  Stale (>$CUTOFF_DAYS days): $count_stale"
echo ""

if [ "$count_stale" -gt 0 ]; then
  echo "⚠️  Stale entries:"
  for entry in "${stale_entries[@]}"; do
    echo "  - $entry"
  done
  echo ""
  echo "→ Action: review & fix or remove (move to BACKLOG P3/P4 if cannot)"
  exit 1
fi

echo "✅ Clean — no stale TODOs"
exit 0
