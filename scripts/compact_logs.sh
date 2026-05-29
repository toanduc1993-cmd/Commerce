#!/bin/bash
# compact_logs.sh — Nén CHANGES_LOG.md + DEVOPS_NOTES.md khi vượt ngưỡng
#
# Quy tắc:
#   - CHANGES_LOG.md > 500 lines → cắt entries cũ hơn 30 ngày sang archive/
#   - DEVOPS_NOTES.md > 800 lines → cảnh báo manual review (không tự cắt — quá quan trọng)
#   - Tạo CHANGES_LOG_INDEX.md liệt kê archives
#
# Chạy: ./scripts/compact_logs.sh (manual)
# Hoặc cron: 0 0 * * 0 cd "VẬT TƯ" && ./scripts/compact_logs.sh  (mỗi Chủ nhật)

set -euo pipefail
cd "$(dirname "$0")/.."

LOG="CHANGES_LOG.md"
ARCHIVE_DIR="archive"
INDEX="CHANGES_LOG_INDEX.md"
THRESHOLD_LINES=500
ARCHIVE_OLDER_DAYS=30

mkdir -p "$ARCHIVE_DIR"

if [ ! -f "$LOG" ]; then
  echo "❌ $LOG không tồn tại"
  exit 1
fi

LINES=$(wc -l < "$LOG" | tr -d ' ')
echo "📊 $LOG: $LINES lines"

if [ "$LINES" -le "$THRESHOLD_LINES" ]; then
  echo "✅ Dưới ngưỡng $THRESHOLD_LINES dòng — không cần nén"
  exit 0
fi

# Cut-off date (entries cũ hơn ARCHIVE_OLDER_DAYS sẽ archive)
CUTOFF=$(date -v-${ARCHIVE_OLDER_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "$ARCHIVE_OLDER_DAYS days ago" +%Y-%m-%d)
ARCHIVE_FILE="$ARCHIVE_DIR/CHANGES_LOG_until_${CUTOFF}.md"

echo "🗓  Cut-off: $CUTOFF — archive entries trước ngày này"

# Python để split: tìm các section "## YYYY-MM-DD" và phân loại
python3 << PYEOF
import re
from pathlib import Path
from datetime import datetime

log_path = Path("$LOG")
archive_path = Path("$ARCHIVE_FILE")
cutoff = datetime.strptime("$CUTOFF", "%Y-%m-%d").date()

content = log_path.read_text()
# Tách header (trước section đầu tiên) + body sections
header_match = re.search(r"^(.*?)(?=^## \d{4}-\d{2}-\d{2}|^## Template)", content, re.MULTILINE | re.DOTALL)
header = header_match.group(1) if header_match else ""

# Tìm tất cả "## YYYY-MM-DD" sections
sections = re.split(r"(^## (?:\d{4}-\d{2}-\d{2}|Template).*?)(?=^## (?:\d{4}-\d{2}-\d{2}|Template|Quy tắc)|\Z)", content, flags=re.MULTILINE | re.DOTALL)
sections = [s for s in sections if s.strip()]

keep_sections = []
archive_sections = []
footer_sections = []  # Template + Quy tắc — always keep

i = 0
while i < len(sections):
    s = sections[i]
    m = re.match(r"^## (\d{4}-\d{2}-\d{2})", s)
    if m:
        section_date = datetime.strptime(m.group(1), "%Y-%m-%d").date()
        body = sections[i+1] if i+1 < len(sections) else ""
        full = s + body
        if section_date < cutoff:
            archive_sections.append(full)
        else:
            keep_sections.append(full)
        i += 2
    elif re.match(r"^## (Template|Quy tắc)", s):
        body = sections[i+1] if i+1 < len(sections) else ""
        footer_sections.append(s + body)
        i += 2
    else:
        i += 1

print(f"  Sections kept (recent): {len(keep_sections)}")
print(f"  Sections archived: {len(archive_sections)}")
print(f"  Footer sections (Template/Quy tắc): {len(footer_sections)}")

if archive_sections:
    archive_header = f"# CHANGES_LOG archive (entries cũ hơn $CUTOFF)\n\nNguồn: tự động cắt từ CHANGES_LOG.md ngày {datetime.now().strftime('%Y-%m-%d')}\n\n---\n\n"
    archive_path.write_text(archive_header + "".join(archive_sections))
    print(f"  ✅ Archived to: {archive_path}")

    # Re-write main log với keep + footer
    new_content = header.rstrip() + "\n\n"
    if Path("CHANGES_LOG_INDEX.md").exists() or True:
        new_content += f"> 📁 Older entries archived: see [{archive_path.name}]({archive_path})\n\n"
    new_content += "".join(keep_sections) + "".join(footer_sections)
    log_path.write_text(new_content)
    print(f"  ✅ Main log rewritten ({len(new_content.splitlines())} lines)")
else:
    print(f"  ℹ️  Không có entries cần archive (tất cả đều mới hơn $CUTOFF)")
PYEOF

# Update INDEX
echo "# CHANGES_LOG_INDEX.md" > "$INDEX"
echo "" >> "$INDEX"
echo "> Auto-generated: $(date)" >> "$INDEX"
echo "" >> "$INDEX"
echo "## Current" >> "$INDEX"
echo "- [CHANGES_LOG.md](CHANGES_LOG.md) — entries gần nhất" >> "$INDEX"
echo "" >> "$INDEX"
echo "## Archives" >> "$INDEX"
for f in "$ARCHIVE_DIR"/CHANGES_LOG_until_*.md; do
  [ -f "$f" ] && echo "- [$f]($f)" >> "$INDEX"
done

echo "✅ Done — index updated"

# DEVOPS_NOTES warning
DEVOPS="DEVOPS_NOTES.md"
if [ -f "$DEVOPS" ]; then
  DLINES=$(wc -l < "$DEVOPS" | tr -d ' ')
  if [ "$DLINES" -gt 800 ]; then
    echo "⚠️  $DEVOPS có $DLINES dòng — cân nhắc review thủ công (đừng auto-archive vì content quan trọng)"
  fi
fi
