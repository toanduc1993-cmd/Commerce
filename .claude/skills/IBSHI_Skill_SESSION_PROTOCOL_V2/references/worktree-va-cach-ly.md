# Worktree và cách ly — đóng được gì, KHÔNG đóng được gì

## Kết luận trước

**Worktree là cách ly NHÁNH, không phải sandbox filesystem, và tuyệt đối không phải cách ly dữ liệu.**

Nó đóng tầng 1. Ba tầng còn lại nguyên vẹn.

| Worktree GIẢI QUYẾT | Worktree KHÔNG giải quyết |
|---|---|
| hai phiên sửa cùng file mã nguồn | chung một Postgres |
| `git add -A` nuốt file của phiên khác | chung một backend đang chạy |
| lẫn lộn nhánh khi commit | chung cổng 5005 / 3000 |
| index git dùng chung | chung file `.env` |
| | migration là tác dụng phụ toàn cục |

Ở dự án nguồn, câu trả lời chính thức cho câu hỏi "worktree có cô lập database không" là: **không, và
đó không phải bug — đó là bản chất của git worktree.** Phần cô lập cổng/CSDL được chuyển về cho
`CLAUDE.md` của từng dự án, vì mỗi stack một khác.

## Nghịch lý `.env`

Vì `.env` bị gitignore nên nó **không tồn tại** trong worktree mới. Hai lựa chọn đều xấu:

- **Không chép `.env`** → worktree không chạy được. Ở dự án nguồn, baseline test đổ với
  `DATABASE_URL is not defined`, và `npm install` cũng hỏng vì postinstall (Prisma generate) cần env.
- **Chép `.env`** → hai worktree trỏ vào **cùng một Postgres**. Mọi thay đổi schema ảnh hưởng cả hai.

Muốn cách ly thật thì `DATABASE_URL` phải **sinh theo phiên**, mỗi phiên một database hoặc một schema
riêng (`search_path`), chứ không chép từ `.env` gốc.

## Nếu quyết định dùng worktree

Thứ tự bắt buộc — đây là xương sống của skill nguồn:

**1. Dò xem đã cách ly chưa.** Đừng tạo worktree trong worktree.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git rev-parse --show-superproject-working-tree 2>/dev/null   # ra path = đang ở submodule
```

`GIT_DIR != GIT_COMMON` nghĩa là đang ở worktree — **nhưng nó cũng đúng khi đang ở submodule**, nên
phải chốt bằng lệnh thứ ba. `pwd -P` là bắt buộc vì trên macOS `/tmp` là symlink.

**2. Dùng công cụ của harness, đừng gõ `git worktree add` tay.** Claude Code có sẵn `EnterWorktree` /
`ExitWorktree`. Dự án nguồn gọi việc bỏ qua công cụ native là **sai lầm số 1**: nó tạo *"phantom state
your harness can't see or manage"* — harness không biết worktree đó tồn tại nên không dọn, không theo
dõi, không khôi phục được.

**3. Kiểm thư mục worktree đã được gitignore CHƯA — trước khi tạo.**

```bash
git check-ignore -q .worktrees || echo "CHUA IGNORE — them vao .gitignore va COMMIT truoc"
```

Nếu quên, chính thói quen `git add -A` đã gây sự cố sẽ nhân đôi thiệt hại: commit trọn cả cây worktree
của phiên kia vào repo.

**4. Xác minh trước lần ghi đầu tiên.** In ra và kiểm bộ ba: đường dẫn cây, nhánh, HEAD. Giả định
thanh trạng thái đang nói dối — đã có ca thật nơi giao diện hiển thị nhánh cha trong khi agent chạy
lệnh ở worktree con. Chưa xác minh được thì **không ghi**.

**5. Dọn dẹp từ cây CHÍNH, theo thứ tự:** gộp → gỡ worktree → xoá nhánh. Làm ngược thì
`git branch -d` sẽ thất bại vì worktree còn giữ nhánh.

## Bẫy lớn nhất: worktree không giam được thao tác file

Đây là lỗi bị than nhiều nhất ở dự án nguồn và **đến nay vẫn chưa sửa**.

Worktree tạo đúng, thư mục làm việc đúng, nhưng agent vẫn ghi vào checkout chính. Cơ chế: lệnh thăm dò
(`grep`, `find`, hoặc agent khám phá) trả về **đường dẫn tuyệt đối của repo gốc**, agent chép thẳng
đường dẫn đó vào lệnh ghi. Không lỗi, không cảnh báo. Xảy ra hai lần trong một phiên.

Điểm chí tử: **`pwd` không bắt được** — thư mục làm việc của shell hoàn toàn đúng, trong khi đường dẫn
tuyệt đối được chép lại trỏ đi nơi khác.

Nếu dùng worktree, hook kiểm tiền tố đường dẫn trên lệnh ghi là **bắt buộc, không phải tuỳ chọn**. Và
cấm chép đường dẫn tuyệt đối từ kết quả tìm kiếm.

## Khuyến nghị cho dự án này

**Chưa dùng worktree ngay.** Lý do: nó đóng đúng một tầng trong bốn, mà tầng nguy hiểm nhất của ta là
cơ sở dữ liệu có dữ liệu thật. Dựng worktree mà không dựng CSDL riêng thì chỉ mua được cảm giác an
toàn giả — và cảm giác an toàn giả là thứ khiến người ta bỏ bớt kỷ luật.

Thứ tự đúng: cơ chế chặn (`references/co-che-chan.md`) trước, rồi giao ước liên phiên, rồi mới tính
worktree khi có thời gian dựng kèm cách ly dữ liệu.
