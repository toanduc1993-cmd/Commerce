#!/bin/bash
# Chặn `git add -A` / `git add .` khi có phiên khác đang làm việc trong repo.
# Hook PreToolUse, matcher "Bash". Đọc JSON từ stdin, chặn bằng permissionDecision=deny.
#
# Vì sao cần: 17/08/2026 một phiên chạy `git add -A` và nuốt trọn 5 file đang làm dở
# của phiên khác vào một commit mang nhãn "nạp dữ liệu Excel". Không mất dữ liệu,
# nhưng hỏng lịch sử — thứ dự án dùng để lần ngược khi có sự cố.
#
# Chỉ chặn khi file điều phối cho biết đang có phiên khác hoạt động, để lúc làm một
# mình không bị vướng. Không có file đó thì cho qua.

set -uo pipefail
LENH=$(jq -r '.tool_input.command // ""' 2>/dev/null)
[ -z "$LENH" ] && exit 0

# Chỉ quan tâm lệnh stage toàn bộ cây làm việc.
# Bắt: git add -A · git add --all · git add . · kể cả khi nối bằng && hoặc ;
if ! printf '%s' "$LENH" | grep -Eq '(^|[;&|]\s*)git[[:space:]]+add[[:space:]]+(-A\b|--all\b|\.(\s|$))'; then
  exit 0
fi

GOC="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
DIEU_PHOI="$GOC/.coord/PHIEN-DANG-CHAY.md"

# Không có file điều phối → đang làm một mình → cho qua.
[ -f "$DIEU_PHOI" ] || exit 0
# File có nhưng không phiên nào đang mở → cho qua.
grep -qiE '^-[[:space:]]*\[[[:space:]]*x?[[:space:]]*\]|dang_chay:[[:space:]]*true' "$DIEU_PHOI" 2>/dev/null || exit 0

CHU=$(grep -iE 'dang_chay:[[:space:]]*true' -B4 "$DIEU_PHOI" 2>/dev/null | grep -iE '^phien:|^- phien:' | head -3 | tr '\n' ' ')

jq -n --arg chu "$CHU" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("Đang có phiên khác làm việc trong repo này (" + $chu + "). `git add -A` / `git add .` sẽ nuốt luôn file đang làm dở của họ — đã xảy ra ngày 17/08/2026. Hãy nêu đích danh đường dẫn của mình, ví dụ: git add backend/src/abc.js CHANGES_LOG.md. Xem .claude/skills/IBSHI_Skill_SESSION_PROTOCOL_V2/SKILL.md")
  }
}'
exit 0
