# Giao việc cho phiên khác

## Prompt bàn giao cần gì

Ngoài nội dung công việc, năm thứ sau — thiếu thứ nào là phiên nhận sẽ đoán, và đoán sai thì làm lại.

1. **Bảng phân vùng sở hữu** — vùng nào được sửa, vùng nào cấm. Cắt theo **thư mục**, đừng cắt theo
   file lẻ trong cùng thư mục.
2. **Cảnh báo file đang sửa dở** — file nào có thay đổi chưa commit của ai. Nói thẳng:
   *"File X đang có thay đổi CHƯA COMMIT của phiên khác — thêm bên dưới, đừng ghi đè, đừng checkout."*
3. **Mốc dữ liệu hiện tại** — để phiên kia biết thế nào là "không làm hỏng gì".
4. **Những quyết định cần người dùng chốt trước khi làm** — để phiên kia không đoán rồi phải làm lại.
5. **Danh sách những thứ đã kiểm và ĐẠT** — để phiên kia không "tiện tay sửa" một chỗ trông có vẻ sai
   mà thật ra đã kiểm rồi.

Điểm 5 hay bị bỏ sót nhưng rất đáng giá: phiên nhận việc không có bối cảnh của bạn.

## Bàn giao bằng FILE, không bằng prompt

Ở dự án nguồn có ca thật: một prompt bàn giao phình lên **42.000 ký tự, 99% là lịch sử dán lại**.

Lý do kỹ thuật: mọi thứ dán vào prompt — và mọi thứ phiên kia in ra — **nằm lại trong ngữ cảnh suốt
phần còn lại của phiên và được đọc lại ở mỗi lượt sau**. Ngữ cảnh là của chung.

Luật: **một prompt bàn giao mô tả MỘT việc, không mô tả lịch sử phiên.** Cần truyền dữ liệu thì ghi
ra file và đưa đường dẫn.

## Đừng để hai phiên cùng GHI code

Luật cứng nhất từ dự án nguồn, nguyên văn: *"Never dispatch multiple implementation subagents in
parallel (conflicts)."*

Song song chỉ dành cho **điều tra, đọc, hoặc sửa những file test tách biệt**. Hai tác nhân cùng ghi
code thì tuần tự, không có ngoại lệ.

Bốn tình huống cấm song song: việc liên quan nhau · cần toàn cảnh · **chưa biết hỏng ở đâu** · dùng
chung trạng thái.

## Trước khi hợp nhất việc của phiên kia

**Rebase sạch không phải bằng chứng đúng đắn.** Rebase bắt xung đột văn bản, không bắt trôi ngữ nghĩa:
spec viết lúc A có thể đã bị vô hiệu bởi thay đổi lúc B, mà rebase vẫn sạch bong.

Bắt buộc: diff xem nhánh chính đã đổi gì từ điểm rẽ nhánh, và đánh giá xem có vô hiệu hoá giả định
không. Delta lớn thì bàn lại chứ đừng vá.

```bash
BASE=$(git merge-base origin/main HEAD)    # ✅ luôn dùng merge-base
git diff "$BASE"..HEAD
```

**Đừng dùng `origin/main` trực tiếp làm mốc so.** Khi nhánh chính dịch chuyển — mà chạy song song thì
nó chắc chắn dịch chuyển — diff hai chấm sẽ hiện những dòng nhánh chính **thêm vào** như thể nhánh
này đang **xoá** chúng. Ở dự án nguồn, cùng một nhánh: mốc `HEAD~1` cho `1 file changed, 1 insertion`;
mốc `origin/main` cho `2 files changed, 1 insertion, 200 deletions`. Reviewer đọc diff nó không tự
tạo ra và báo cáo những dòng xoá không hề tồn tại.

Cũng đừng dùng `HEAD~1` — nó **im lặng bỏ qua tất cả trừ commit cuối** của một việc nhiều commit.

## Phiên chỉ đọc phải bị cấm các lệnh dịch chuyển HEAD

`git checkout <sha>`, `git switch`, `git reset`, `git stash` — một reviewer chạy `git checkout <sha>`
để "so sánh" đã tạo ra **11 commit mồ côi** trước khi ai đó nhận ra. Chi tiết chí tử: cả hai lần
checkout đều có **diff rỗng**, nên không có gì nhìn thấy được thay đổi.

Thay bằng: `git show <sha>:<path>` · `git diff` · `git log -p` · hoặc worktree tạm riêng.
