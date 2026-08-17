---
name: IBSHI_Skill_SESSION_PROTOCOL_V2
description: Điều phối nhiều phiên Claude làm việc song song trên CÙNG một workspace / kho git / cơ sở dữ liệu — chống ghi đè, trùng việc, dẫm chân nhau. Dùng BẤT CỨ KHI NÀO có dấu hiệu nhiều phiên cùng chạy: người dùng nhắc "session khác", "phiên kia", "chạy song song", "nhiều session", tên một phiên cụ thể (CPVT, OCRP, DA, "Code vật tư"), hoặc bảo viết prompt giao việc cho phiên khác. Dùng khi TỰ PHÁT HIỆN dấu vết phiên khác: thay đổi chưa commit mà mình không tạo ra, số liệu đổi giữa hai lần đo, commit lạ trong git log, bản ghi lạ trong nhật ký kiểm toán, hoặc lệnh vừa chạy được giờ báo lỗi mà code không đổi. Dùng TRƯỚC mọi việc có tác dụng phụ toàn cục: đổi schema, thêm ràng buộc cơ sở dữ liệu, khởi động lại máy chủ, sửa biến môi trường, chạy script làm sạch dữ liệu. Dùng khi cân nhắc git worktree, hoặc khi cần quyết định có nên chạy song song hay không.
---

# Nhiều phiên trên cùng một workspace

Giao thức `_sessions/PROTOCOL.md` của dự án lo **nhiều phiên ở nhiều workspace khác nhau** nhắn tin
cho nhau. Skill này lo tình huống khác và nguy hiểm hơn: **hai phiên trở lên cùng đứng trong MỘT
workspace, MỘT kho git, MỘT cơ sở dữ liệu, cùng lúc.**

**V1 thất bại ở đâu.** V1 là kỷ luật: nó chỉ có tác dụng nếu phiên kia *có đọc*. Ngày 17/08/2026 một
phiên chạy `git add -A` và nuốt trọn 5 file đang làm dở của phiên khác vào một commit mang nhãn
"nạp dữ liệu Excel" — trong khi luật cấm việc ấy đang nằm ngay trong repo. V2 chuyển những chỗ máy
kiểm được thành **cơ chế chặn**, và chỉ để lại văn bản cho phần cần phán đoán.

## Bốn tầng trạng thái dùng chung

`git status` chỉ thấy tầng 1. Ba tầng dưới vô hình.

| Tầng | Ví dụ | Hỏng thế nào |
|---|---|---|
| 1. File và git | mã nguồn, tài liệu, sổ thay đổi, index | ghi đè, mất việc chưa commit, lịch sử sai |
| 2. Cơ sở dữ liệu | bảng, bản ghi, mốc số liệu, schema | phiên A đo mốc, phiên B ghi vào giữa → phép so vô nghĩa |
| 3. Tiến trình đang chạy | máy chủ API, giao diện, cổng | phiên A sửa code, máy chủ của phiên B chưa nạp lại |
| 4. Tác dụng phụ toàn cục | ràng buộc, migration, biến môi trường, chốt tạm | phiên A chặn một thao tác để thử, phiên B tưởng hệ thống hỏng |

Một phiên cẩn thận vẫn phá được việc của phiên kia **mà không chạm file nào của họ** — chỉ cần ghi
một bản ghi vào cơ sở dữ liệu đúng lúc phiên kia đang đo.

## Nghi thức mở phiên — chạy trước khi gõ phím

Bốn lệnh, rẻ, cứu cả buổi. Kết quả in ra thành "danh thiếp" để phiên kia nhìn bằng dữ liệu chứ không
bằng lời hứa.

```bash
git rev-parse --show-toplevel     # mình đang đứng ở cây làm việc nào
git branch --show-current          # nhánh nào
git status --short                 # có gì chưa commit? có phải của mình không?
git log --oneline -5               # có commit nào mình không nhớ đã tạo?
```

**Đọc kết quả:**
- `git status` có file lạ → **giả định đó là của phiên khác.** Không `git checkout`, không `git stash`,
  không `git reset`. Hỏi trước.
- Commit mới hơn lần mình đo → có phiên khác vừa làm. Đọc `git log` xem họ đụng gì.
- Đo luôn mốc dữ liệu nếu phiên này sẽ chạm cơ sở dữ liệu (xem `references/nghi-thuc-mo-phien.md`).

**Fail-closed:** chưa xác minh được mình đang ở đâu thì **chưa ghi**. Đây là bài học từ một ca thật
nơi giao diện hiển thị nhánh cha trong khi agent chạy lệnh ở worktree con — thanh trạng thái nói dối,
chỉ lệnh mới nói thật.

## Ba cơ chế thay cho ba lời dặn

Chỗ nào máy kiểm được thì đừng viết thành tài liệu. Ba script trong `scripts/`:

| Script | Chặn cái gì | Bật thế nào |
|---|---|---|
| `chan-git-add-all.sh` | `git add -A` / `git add .` khi có phiên khác đang mở | hook `PreToolUse`, matcher `Bash` |
| `kiem-truoc-khi-ghi.sh` | `git commit` / `git add` khi cây làm việc hoặc nhánh không khớp kỳ vọng | hook `PreToolUse`, hoặc gọi tay trước khi commit |
| `do-moc-du-lieu.sh` | không chặn — in mốc để so trước/sau | gọi tay đầu và cuối phiên |

Cách cài đặt và nội dung cấu hình: `references/co-che-chan.md`.

**Hook chỉ được nạp khi khởi động phiên.** Thêm vào `settings.json` giữa chừng không có hiệu lực —
phải mở lại phiên, rồi thử bằng `git add -A --dry-run` để xác nhận nó thật sự chặn.

**Vì sao phải là cơ chế, không phải lời dặn:** trong một ca thật ở dự án nguồn, lệnh cấm viết bằng
văn xuôi bị **cả 3/3 agent phớt lờ**. Lệnh cấm chỉ có giá trị khi có thứ gì đó thi hành nó.

## Kỷ luật commit

**Chỉ `git add` đúng đường dẫn mình sở hữu.**

```bash
# ❌ SAI — quét sạch cây làm việc, nuốt luôn việc dở dang của phiên khác
git add -A && git commit -m "..."

# ✅ ĐÚNG — nêu đích danh những gì mình vừa làm
git add backend/src/controllers/abc.js CHANGES_LOG.md
git commit -m "..."
```

Hậu quả **không phải mất dữ liệu** nên rất dễ bỏ qua — file vẫn còn, mọi thứ trông vẫn ổn. Cái hỏng
là **lịch sử**: một commit mang nhãn "nạp dữ liệu" mà bên trong có tài liệu kiểm thử thì sau này
không ai lần ngược được. Sổ thay đổi và `git log` là tấm lưới an toàn của dự án; làm nhiễu chúng là
rút lưới đi đúng lúc không ai nhận ra.

Kèm theo: file bị commit ở trạng thái **dở dang**. Một bản nháp giữa chừng vào git trông y hệt bản
hoàn chỉnh.

Lỡ gom nhầm thì **đừng sửa lịch sử để che** — nói ra, và tách bằng một commit tiếp theo có thông
điệp đúng.

**Ghi tên phiên vào commit** để lần ngược được: thêm dòng cuối `Session: <tên phiên>`.

## File trạng thái dùng chung: khoá theo PHIÊN, không theo repo

Đây là chế độ hỏng đắt nhất quan sát được ở dự án nguồn, và nó **không mất dữ liệu — nó bỏ việc trong
im lặng**. Một file tiến độ dùng chung không mang định danh phiên khiến phiên sau đọc tiến độ của
phiên trước, tưởng 5 việc đã xong, và **nhảy qua cả 5 việc chưa từng làm**.

Luật:

1. **Mọi file trạng thái phải có header tự khai danh tính** — phiên nào, nhánh nào, ngày nào.
2. **Chỉ tin dòng nào khớp danh tính đang chạy.** Lệch thì lưu trữ và bắt đầu mới, đừng đọc tiếp.
3. **Không ghi thẳng vào đường dẫn dùng chung.** Ghi ra file tạm rồi `mv` — `mv` là nguyên tử, còn
   `>` cắt cụt file đích **ngay cả khi lệnh sau đó thất bại**.
4. **Thư mục bị gitignore là vùng không có lưới an toàn.** Mất là mất hẳn, không có `git log` để lùi.

Với sổ thay đổi và ghi chú vận hành — file mà luật dự án bắt mọi phiên phải ghi: **chỉ thêm mục mới,
không sửa mục của phiên khác**; đọc lại file ngay trước khi ghi; thấy nội dung lạ thì giữ nguyên.

## Cơ sở dữ liệu là tài nguyên dùng chung

Tầng này hay bị quên nhất vì `git status` không thấy gì.

- **Mốc số liệu hỏng rất nhanh.** Đo mốc rồi đi làm việc khác 20 phút, quay lại so — con số đã đổi vì
  phiên kia (hoặc chính người dùng đang bấm trên trình duyệt) vừa ghi vào. **Đo lại ngay trước khi
  so, đừng tin số đo cũ.**
- **Chênh lệch không giải thích được thì HỎI, đừng tự sửa số.** Truy nguồn trước: nhật ký kiểm toán
  thường ghi ai làm, lúc nào, đổi từ gì sang gì.
- **Ảnh chụp nguyên trạng phải bao đúng phạm vi sẽ đụng.** Chụp thiếu thì lúc khôi phục không đưa về
  mốc được, và tệ hơn là không biết mình đã chụp thiếu.
- **Đừng khôi phục dữ liệu người khác vừa tạo.** Thấy bản ghi lạ trong vùng mình định dọn → hỏi đó là
  việc thật hay bấm thử.
- **Migration là thao tác toàn cục.** Chỉ một phiên được làm, và phải báo trước.

## Tiến trình đang chạy không thuộc về bạn

- Sửa code xong **không có nghĩa là hệ thống đã đổi.** Kiểm xem tiến trình có tự nạp lại không; nếu
  không thì bản vá chỉ nằm trên đĩa.
- **Xác nhận bằng bằng chứng từ hệ thống đang chạy**, không phải bằng nội dung file. Đọc header máy
  chủ thật sự trả về, chứ không phải đọc lại dòng code vừa sửa.
- Cần khởi động lại thì **đưa lệnh cho người dùng và chờ**. Đừng kết luận "đã xong" khi chưa thấy
  tiến trình mới lên.

## Tác dụng phụ toàn cục — nêu phạm vi trước khi làm

Chốt an toàn, ràng buộc tạm, biến môi trường, migration. Trước khi đặt, trả lời được ba câu:

1. Nó chặn/đổi những gì, và với **ai** — chỉ mình, hay cả hệ thống?
2. Ai sẽ gặp nó mà không hiểu vì sao?
3. Gỡ bằng cách nào, và nếu phiên này chết giữa chừng thì ai gỡ?

Rồi **nói rõ trước khi đặt, và nhắc lại khi còn treo.** Đặt xong thì **tự thử xem nó có thật sự cắn
không** — chốt an toàn không cắn còn nguy hơn không có chốt, vì nó tạo cảm giác an toàn giả.

## Xung đột logic — thứ không cơ chế nào bắt được

Hai phiên viết code đúng nhưng **giả định trái nhau**. Gộp lại thì từng phần đều đúng mà hệ thống vẫn
hỏng, và **git không báo xung đột nào cả**.

Ví dụ thật đang chờ xảy ra ở dự án này: phiên viết code sửa phân quyền 41 route, trong khi phiên kiểm
thử viết ca kiểm dựa trên hành vi hiện tại. Phiên code đổi mã lỗi trả về hay đổi tên vai trò là bộ ca
kiểm sai ngay — rebase vẫn sạch bong.

**Luật: chốt trước danh sách giao ước liên phiên** — tên vai trò, mã lỗi, tên trường, đường dẫn API,
tên cột. Đổi bất kỳ thứ nào trong danh sách đó là **thay đổi phải báo**, không phải chi tiết nội bộ.

**Và: rebase sạch không phải bằng chứng đúng đắn.** Trước khi hợp nhất việc của một phiên, diff xem
nhánh chính đã đổi gì từ điểm rẽ nhánh và đánh giá xem những thay đổi đó có vô hiệu hoá giả định của
mình không.

**Khi so diff, luôn dùng `git merge-base`:**

```bash
BASE=$(git merge-base origin/main HEAD)   # ✅
# ❌ BASE=origin/main  → khi main dịch chuyển, diff hai chấm hiện những dòng
#    main thêm vào như thể NHÁNH NÀY đang xoá chúng. Reviewer báo cáo xoá bịa.
```

Chạy song song thì nhánh chính **chắc chắn** dịch chuyển. Đây là lỗi im lặng và không thường xuyên
nên rất khó tái hiện về sau.

## Có nên chạy song song không?

Chuẩn của ngành: **chỉ chạy song song khi các nhánh việc không dùng chung trạng thái.** Bốn tình
huống cấm: việc liên quan nhau · cần toàn cảnh · **chưa biết hỏng ở đâu** · dùng chung trạng thái.

Và luật cứng nhất từ dự án nguồn: **hai tác nhân cùng GHI code thì tuyệt đối tuần tự.** Song song chỉ
dành cho điều tra, đọc, hoặc sửa những file test tách biệt.

**Vị trí thật của dự án này:** đang dùng chung một Postgres, một backend, một giao diện. Theo chuẩn
trên thì **lẽ ra không nên** chạy hai phiên song song. Nhưng cách ly thật tốn kém và dự án đang gấp.
Nên ta ở **vùng thứ ba: vẫn song song, chấp nhận rủi ro có kiểm soát.**

Ai đọc skill này phải biết mình đang ở vùng đó — chứ không tưởng cứ theo skill là an toàn. Danh sách
cụ thể những gì vì chưa cách ly mà có thể hỏng: `references/worktree-va-cach-ly.md`.

## Bảng nguỵ biện

| Câu tự nhủ | Thực tế |
|---|---|
| "Phiên kia chắc không đụng file này" | Ngày 17/08 một `git add -A` nuốt 5 file của phiên khác. Nêu đích danh đường dẫn mất 5 giây. |
| "Chỉ sửa 1 dòng nên `add -A` cho nhanh" | Nhanh cho bạn, hỏng lịch sử cho cả dự án. Chi phí rơi vào người lần ngược 3 tháng sau. |
| "Số liệu vừa đo cách đây 20 phút, còn dùng được" | Phiên kia ghi vào giữa. Đo lại mất 1 giây, so sai mất cả buổi. |
| "Restart backend 2 giây thôi" | Máy chủ không thuộc về bạn. Người dùng đang mở trình duyệt trên đó. |
| "Sửa code xong rồi, chắc chạy được" | Bản vá nằm trên đĩa chứ chưa vào tiến trình. Đọc header máy chủ trả về mới biết. |
| "Chốt an toàn đặt xong là yên tâm" | Chốt không cắn còn nguy hơn không có chốt. Tự thử một lần. |
| "Rebase sạch nghĩa là không xung đột" | Rebase bắt xung đột văn bản, không bắt trôi ngữ nghĩa. |
| "Có worktree rồi thì an toàn" | Worktree đóng tầng 1. CSDL, cổng, tiến trình vẫn dùng chung y nguyên. |
| "Dọn cho sạch cây làm việc rồi làm tiếp" | File lạ là việc dở dang của phiên khác. `git checkout` là xoá vĩnh viễn. |

## Cờ đỏ — dừng lại và xác minh

- Số liệu đổi giữa hai lần đo mà mình không ghi gì vào giữa.
- `git status` có file mình không nhớ đã sửa.
- Thao tác vừa chạy được, giờ báo lỗi mà code không đổi.
- Nhật ký kiểm toán có bản ghi trong khoảng thời gian mình làm nhưng không phải việc của mình.
- Bản vá đã ghi vào file nhưng hệ thống vẫn hành xử như cũ.
- Bảng hoặc ràng buộc lạ trong cơ sở dữ liệu, tên có dấu vết ngày tháng.
- `git commit` in `[detached HEAD ...]` thay vì tên nhánh.
- Diff review hiện các dòng **xoá** ở những file mà việc của mình chỉ thêm mới.

## Kết phiên

- Nêu rõ **những gì còn treo**: chốt an toàn chưa gỡ, bảng tạm chưa dọn, dữ liệu chưa về mốc, máy chủ
  cần khởi động lại.
- Nêu rõ **những gì mình đã đụng** mà phiên khác cần biết.
- Chưa commit thì nói chưa commit. Chưa push thì nói chưa push.
- Đừng dọn dẹp thứ mình không chắc là của mình.

## Đọc thêm

- `references/nghi-thuc-mo-phien.md` — lệnh dò đầy đủ, cách đo mốc dữ liệu, mẫu danh thiếp phiên.
- `references/co-che-chan.md` — cấu hình hook, nội dung `settings.json`, cách thử chốt.
- `references/worktree-va-cach-ly.md` — có nên dùng worktree, nó đóng được gì và KHÔNG đóng được gì.
- `references/bai-hoc-tu-thuc-dia.md` — 12 chế độ hỏng thật quan sát được ở dự án nguồn 272k sao,
  kèm nguyên nhân gốc và cách sửa đã kiểm chứng. Đọc khi cần thuyết phục ai đó rằng những luật trên
  không phải lo xa.
- `references/giao-viec-cho-phien-khac.md` — soạn prompt bàn giao.
