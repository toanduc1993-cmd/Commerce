# Nghi thức mở phiên

Chạy trước khi gõ phím. Mất chưa tới một phút.

## 1. Mình đang ở đâu

```bash
git rev-parse --show-toplevel      # cây làm việc
git branch --show-current           # nhánh — RỖNG nghĩa là HEAD rời, commit sẽ mồ côi
git rev-parse --short HEAD          # HEAD
git status --short                  # có gì chưa commit
git log --oneline -5                # ai vừa làm gì
```

**Fail-closed:** chưa xác minh được thì chưa ghi.

## 2. Có phiên khác không

Người dùng thường không nói. Dấu hiệu:

- `git status` có file mình không nhớ đã sửa → **giả định của phiên khác**, không `checkout`/`stash`/`reset`.
- `git log` có commit mới hơn lần mình đo.
- Tiến trình máy chủ khởi động ở thời điểm mình không biết: `ps -o lstart= -p $(lsof -nP -iTCP:5005 -sTCP:LISTEN -t)`
- Bản ghi mới trong nhật ký kiểm toán không phải việc của mình.

## 3. Đo mốc dữ liệu — nếu phiên này sẽ chạm cơ sở dữ liệu

```bash
.claude/skills/IBSHI_Skill_SESSION_PROTOCOL_V2/scripts/do-moc-du-lieu.sh
```

Lưu kết quả lại. **Đo lại ngay trước khi so** — đừng tin số đo cũ, vì phiên kia có thể đã ghi vào
giữa. Script cũng in các bảng `_backup_*` và ràng buộc `_guard_*` còn treo từ phiên trước.

## 4. Khai danh tính

Ghi vào `.coord/PHIEN-DANG-CHAY.md` để phiên kia nhìn bằng dữ liệu chứ không bằng lời hứa. File này
cũng là thứ `chan-git-add-all.sh` đọc để quyết định có chặn hay không.

```markdown
# Phiên đang chạy

## cpvt-kiemthu
phien: cpvt-kiemthu
dang_chay: true
cay: /Users/.../VẬT TƯ
nhanh: main
bat_dau: 2026-08-17 13:00
so_huu:
  - deploy/uat/**
  - docs/VAN-DE-*.md
dang_do:
  - cập nhật UAT_CHECKLIST phần L→O
```

**Kết phiên thì đổi `dang_chay: false`.** Bỏ quên sẽ khiến phiên sau bị chặn `git add -A` vô cớ và
mất niềm tin vào chốt.

## Vì sao khai danh tính lại quan trọng đến thế

Chế độ hỏng đắt nhất quan sát được ở dự án nguồn **không mất dữ liệu — nó bỏ việc trong im lặng**:
một file tiến độ dùng chung không mang định danh phiên khiến phiên sau đọc tiến độ của phiên trước,
tưởng 5 việc đã xong, và nhảy qua cả 5 việc chưa từng làm.

Luật rút ra: **khoá theo PHIÊN, không theo repo hay cây làm việc.** Một file trạng thái mà chỉ khoá
theo đường dẫn repo thì hai phiên trên cùng checkout sẽ đè lên nhau.
