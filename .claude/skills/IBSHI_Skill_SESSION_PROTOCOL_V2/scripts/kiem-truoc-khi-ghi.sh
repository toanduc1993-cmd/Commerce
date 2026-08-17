#!/bin/bash
# Xác minh cây làm việc + nhánh + HEAD TRƯỚC khi ghi vào git.
# Dùng làm hook PreToolUse (matcher Bash, if "Bash(git commit *)") hoặc gọi tay.
#
# Vì sao: ở dự án nguồn, 1 trong 17 subagent commit nhầm lên nhánh main của checkout
# CHÍNH thay vì worktree đang làm — main mang code nửa vời, mồ côi. Cổng review không
# bắt được; nó chỉ lộ ra nhờ một bất thường tình cờ trong diff.
# Guard hai dòng dưới đây đã được kiểm chứng trên thực địa: sau khi thêm, không tái diễn
# trong 13 task còn lại.
#
# Đặt biến môi trường để bật kiểm nghiêm: PHIEN_CAY_KY_VONG, PHIEN_NHANH_KY_VONG.
# Không đặt thì script chỉ IN trạng thái, không chặn.

set -uo pipefail
CAY=$(git rev-parse --show-toplevel 2>/dev/null || echo "(khong phai kho git)")
NHANH=$(git branch --show-current 2>/dev/null)
HEAD_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo '?')

# HEAD rời là bất thường trong mọi trường hợp — commit sẽ mồ côi.
if [ -z "$NHANH" ]; then
  echo "CHAN: HEAD dang ROI (detached, $HEAD_SHA). Commit se mo coi, khong thuoc nhanh nao." >&2
  echo "  Sua: git switch <nhanh>   — hoac neu dang review thi dung git show/git diff, dung checkout." >&2
  exit 2
fi

if [ -n "${PHIEN_CAY_KY_VONG:-}" ] && [ "$CAY" != "$PHIEN_CAY_KY_VONG" ]; then
  echo "CHAN: dang o cay '$CAY' nhung ky vong '$PHIEN_CAY_KY_VONG'." >&2
  echo "  Rat co the ban dang ghi vao checkout CHINH thay vi worktree cua minh." >&2
  exit 2
fi
if [ -n "${PHIEN_NHANH_KY_VONG:-}" ] && [ "$NHANH" != "$PHIEN_NHANH_KY_VONG" ]; then
  echo "CHAN: dang o nhanh '$NHANH' nhung ky vong '$PHIEN_NHANH_KY_VONG'." >&2
  exit 2
fi

echo "OK  cay=$CAY  nhanh=$NHANH  HEAD=$HEAD_SHA"
exit 0
