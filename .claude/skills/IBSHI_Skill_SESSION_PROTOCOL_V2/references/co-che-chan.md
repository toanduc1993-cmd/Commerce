# Cơ chế chặn — cài đặt hook

Ba script trong `scripts/` chỉ có tác dụng khi được nối vào hook. Chưa nối thì chúng chỉ là file.

## Vì sao phải là hook, không phải luật viết trong skill

Ở dự án nguồn, một lệnh cấm viết bằng văn xuôi trong prompt bị **cả 3/3 agent phớt lờ**. Và chính sự
cố 17/08/2026 ở dự án này xảy ra trong khi luật cấm `git add -A` đang nằm sẵn trong repo.

Luật chỉ có giá trị khi có thứ gì đó thi hành nó.

## Cấu hình

Thêm vào `.claude/settings.json` của dự án (khác `settings.local.json` — file `.json` được chia sẻ
qua git, `local` thì không):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git add *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/skills/IBSHI_Skill_SESSION_PROTOCOL_V2/scripts/chan-git-add-all.sh"
          },
          {
            "type": "command",
            "if": "Bash(git commit *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/skills/IBSHI_Skill_SESSION_PROTOCOL_V2/scripts/kiem-truoc-khi-ghi.sh"
          }
        ]
      }
    ]
  }
}
```

Trường `if` khiến hook **không chạy** trừ khi lệnh khớp mẫu — tiết kiệm, và tránh mọi lệnh Bash đều
phải qua một tiến trình phụ.

## Cách chặn hoạt động

Hook nhận JSON qua stdin, lấy lệnh ở `.tool_input.command`. Hai cách từ chối:

| Cách | Khi nào dùng |
|---|---|
| `exit 2` kèm thông điệp ra stderr | chặn vô điều kiện, không gì ghi đè được |
| `exit 0` + in JSON `permissionDecision: "deny"` | chặn kèm lý do hiển thị đẹp, linh hoạt hơn |

`exit 0` mà không in gì = không ra phán quyết, luồng quyền bình thường tiếp tục.

## Nguyên tắc thiết kế: chặn có điều kiện, đừng chặn cứng

`chan-git-add-all.sh` đọc `.coord/PHIEN-DANG-CHAY.md` và **chỉ chặn khi thật sự có phiên khác đang
mở**. Làm một mình thì nó im lặng cho qua.

Chặn cứng thì tiện lúc viết luật nhưng vướng lúc dùng — mà thứ gì vướng thì sớm muộn cũng bị tắt đi,
và lúc đó không còn lớp bảo vệ nào. Một chốt luôn bật nhưng bị vô hiệu hoá tệ hơn một chốt chỉ bật
đúng lúc.

Thông điệp chặn cũng phải **nói phải làm gì thay thế**, không chỉ nói "không được".

## ⚠️ Hook chỉ được nạp khi KHỞI ĐỘNG phiên

Thêm hook vào `settings.json` giữa chừng **không có hiệu lực ngay**. Đã kiểm chứng 17/08/2026: sau
khi ghi cấu hình, lệnh `git add -A --dry-run` vẫn chạy bình thường, hook không hề gọi.

**Phải mở lại phiên Claude thì hook mới sống.** Và sau khi mở lại, **phải thử lại bằng lệnh thật** —
đừng cho rằng đã bật là đã chạy:

```bash
git add -A --dry-run    # phải BỊ CHẶN. Dùng --dry-run để nếu hook chưa sống thì cũng không stage nhầm.
```

Dùng `--dry-run` cho lần thử đầu là bắt buộc: nếu hook chưa sống mà thử bằng `git add -A` thật thì
chính lần thử đó đã gây ra đúng sự cố mình đang cố ngăn.

## Thử chốt sau khi cài — bắt buộc

Chốt không cắn còn nguy hơn không có chốt, vì nó tạo cảm giác an toàn giả.

```bash
S=.claude/skills/IBSHI_Skill_SESSION_PROTOCOL_V2/scripts
mkdir -p .coord && printf 'phien: thu-chot\ndang_chay: true\n' > .coord/PHIEN-DANG-CHAY.md

# phải ra "deny"
echo '{"tool_input":{"command":"git add -A"}}' | $S/chan-git-add-all.sh | jq -r '.hookSpecificOutput.permissionDecision'
# phải KHÔNG in gì (cho qua)
echo '{"tool_input":{"command":"git add docs/a.md"}}' | $S/chan-git-add-all.sh
```

## Giới hạn cần biết

- Hook chặn theo **chuỗi lệnh**, nên một cách viết lạ có thể lọt. Nó là lớp phòng thủ, không phải
  tường thành. Đừng vì có hook mà bỏ kỷ luật.
- Hook chỉ chặn lệnh chạy **qua công cụ Bash của Claude**. Người dùng gõ tay trong terminal riêng thì
  không qua hook.
- Luật `permissions.deny` trong `settings.json` là lớp thứ hai, đơn giản hơn nhưng **chặn cứng**,
  không đọc được ngữ cảnh.
