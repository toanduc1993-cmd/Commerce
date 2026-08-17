# Bài học từ thực địa — 12 chế độ hỏng thật khi nhiều phiên chạy song song

> **Nguồn:** khảo sát issue của [`obra/superpowers`](https://github.com/obra/superpowers) ngày
> 17/08/2026 — kho 272.929 sao, 38 người đóng góp, MIT, là dự án chín nhất hiện có về điều phối
> nhiều tác nhân AI. Đây **không phải lo xa**: mỗi mục dưới đây là một sự cố đã xảy ra thật, phần
> lớn có nguyên nhân gốc đã truy ra và cách sửa đã kiểm chứng.
>
> Đọc tài liệu này khi cần hiểu **vì sao** một luật trong SKILL.md lại gắt đến thế, hoặc khi cần
> thuyết phục ai đó rằng chi phí phòng ngừa rẻ hơn chi phí sửa.

Đã đọc 2 issue chỉ định + quét 20 từ khoá, đọc trọn nội dung và bình luận của 21 issue liên quan nhất. Dưới đây là báo cáo.

---

# Lỗi thực tế trong obra/superpowers khi nhiều phiên chạy song song

Nguồn: `gh api` + `gh search issues` trên `obra/superpowers`, ngày 2026-08-17. Bản ghi thô lưu tại:
`/private/tmp/claude-501/-Users-trinhhuuhung-Desktop-IBSHI-01-IBSHI-TH--NG-M-I-IBSHI-TH--NG-M-I-C-NG-NGH--V-T-T-/acf36bf9-bafc-4356-8c0b-09a7e206f8c9/scratchpad/batch{1,2,3}.txt`

---

## 1. #1942 · SDD workspace `.superpowers/sdd` đụng nhau giữa các phiên cùng checkout · ĐÃ ĐÓNG

**Chế độ hỏng thật.** Hai phiên Claude chạy trên cùng một checkout. Phiên A sinh `task-3-brief.md`; phiên B ghi đè chính file đó. Subagent của A đọc brief và **thực thi task của kế hoạch khác** — người báo cáo thấy `task-3-brief.md` của mình chứa task "Deploy the bridge" của kế hoạch khác, `task-8-brief.md` chứa "Auth guard" không liên quan. `progress.md` cũng phản ánh trạng thái của phiên kia. Hỏng âm thầm, không lỗi, không cảnh báo.

**Nguyên nhân gốc.** Đây là **hồi quy do sửa một lỗi khác** (#1780). Trước 6.0.x, thư mục scratch giải ra `git rev-parse --git-path sdd`, tức nằm trong `.git` — mà mỗi worktree có `.git` riêng, nên tự nhiên cô lập theo worktree. Header của script cũ ghi rõ nó "unique per repo instance". Bản 6.1.0 chuyển sang `git rev-parse --show-toplevel`, tức gốc cây làm việc. Câu chốt của người báo cáo: per *working-tree* không phải per *session*. Khoá file chỉ là `task-N` và `progress.md`, không có định danh phiên.

**Cách sửa.** PR #1943 (6.1.x/6.2.0): scope artifact theo kế hoạch (`.superpowers/sdd/<plan-basename>/`), ledger tự khai danh tính, dọn dẹp cuối kế hoạch. **Biện pháp người dùng tự triển khai tại chỗ trước khi có bản vá**: một hook `PreToolUse` từ chối lời gọi `task-brief`/`review-package` trần (loại mặc định về thư mục dùng chung), bắt buộc phải truyền `OUTFILE` riêng theo phiên hoặc cwd nằm trong worktree.

**Bài học áp cho ta.** Mọi file trạng thái dùng chung phải khoá theo **định danh phiên**, không phải theo repo/cây làm việc. Và cảnh báo lớn hơn: bản vá cho một vấn đề (quyền ghi) đã tạo ra lỗi đua dữ liệu — khi ta dời file điều phối, phải hỏi "khoá này có duy nhất theo phiên không".

---

## 2. #2012 / #2045 / #1888 / #1816 · Trùng tên file scratch, ghi đè im lặng · ĐÓNG (còn #2045 mở)

**Chế độ hỏng thật.** Ba tầng, tầng sau lộ ra sau khi vá tầng trước:

- #2012: tên file khoá theo *số task*, mà số task khởi lại từ 1 ở mỗi kế hoạch. Kế hoạch B task 1 đè kế hoạch A task 1. Người báo cáo mất 2 file, 12 file nữa nằm trong bán kính nổ. Vì thư mục bị gitignore nên **không có lịch sử để phục hồi**.
- #2045 (vẫn mở, trên 6.2.0): bản vá #1943 dùng `basename`, nên `docs/alpha/plan.md` và `docs/beta/plan.md` vẫn cùng đổ về `.superpowers/sdd/plan/`. Đúng những basename hay lặp nhất: `plan.md`, `implementation-plan.md`, `README.md`.
- #2045 phát hiện thêm một bẫy tinh vi hơn: `task-brief` chuyển hướng `awk ... > "$out"` **trước** khi kiểm tra "không tìm thấy task". Nên một lần gọi **thất bại** vẫn cắt cụt file của kế hoạch kia về 0 byte, rồi báo "task not found" — người vận hành tưởng không có gì được ghi.

**Nguyên nhân gốc.** Đường dẫn tất định + không gian tên quá nông + `>` cắt cụt trước khi kiểm lỗi.

**Cách sửa.** Đã sửa: namespace theo kế hoạch. Chưa sửa (#2045): maintainer bác cách slug theo đường dẫn đầy đủ, chốt hướng **ghi "dấu chủ sở hữu" (ownership marker)** vào workspace — nếu tra ra marker mang tên kế hoạch khác thì kích hoạt giải trùng. Khuyến nghị kỹ thuật kèm theo: ghi ra file tạm rồi `mv` vào chỗ, và từ chối ghi đè nếu không có `--force`.

**Bài học áp cho ta.** (a) Không bao giờ ghi thẳng vào đường dẫn dùng chung — ghi tạm rồi `mv` nguyên tử. (b) Đặt "dấu chủ" trong mỗi file trạng thái và kiểm trước khi ghi. (c) Thư mục bị gitignore là **vùng không có mạng an toàn** — mất là mất hẳn. (d) Cẩn thận với redirect `>` trong script điều phối: nó phá hoại ngay cả khi lệnh thất bại.

---

## 3. #1936 · Ledger không mang định danh kế hoạch → phiên sau **bỏ qua task** · ĐÃ ĐÓNG

**Chế độ hỏng thật.** Đây không phải mất file mà là **hỏng luồng điều khiển**. Dòng ledger có dạng `Task N: complete (commits ...)` — không có tên kế hoạch, nhánh, hay run id. Skill lại dặn: khởi động thì đọc ledger, task nào ghi complete là XONG, đừng dispatch lại. Chạy kế hoạch thứ hai trong cùng repo, controller đọc ledger của kế hoạch trước, thấy task 1–5 "complete", và **nhảy thẳng sang task 6 của kế hoạch mới** — 5 task chưa từng được làm.

Biến thể tệ hơn: một run bị tạm dừng giữa chừng để debug, một luồng khác chạy xen vào cùng cây làm việc, rồi run gốc tiếp tục — hai run đan dòng vào cùng `progress.md`, không cách nào quy thuộc. Đúng vào tình huống sau nén ngữ cảnh, khi skill bảo "tin ledger hơn trí nhớ".

**Cách sửa.** PR #1943: ledger tự khai danh tính (header ghi plan path/branch/ngày); chỉ tin các dòng complete thuộc đúng kế hoạch đang chạy; lệch thì lưu trữ và bắt đầu mới.

**Bài học áp cho ta.** File tiến độ dùng chung nguy hiểm hơn file dữ liệu dùng chung: hỏng dữ liệu thì thấy, hỏng luồng điều khiển thì **im lặng bỏ việc**. Nhật ký phiên của ta phải có header định danh, và luật đọc phải là "khớp danh tính mới tin".

---

## 4. #1040 · Worktree KHÔNG giam được thao tác file · ĐANG MỞ (3 bình luận, đây là lỗi bị than nhiều nhất)

**Chế độ hỏng thật.** Worktree được tạo đúng, cwd đúng, nhưng agent vẫn ghi vào checkout chính. Cơ chế: agent thăm dò (grep/find/subagent khám phá) trả về **đường dẫn tuyệt đối của repo gốc**, agent chép thẳng đường dẫn đó vào `Write`/`Edit`. Theo @takasek, công cụ lặng lẽ thao tác trên checkout chính, không lỗi, không cảnh báo — xảy ra hai lần trong một phiên. Anh ta chỉ ra chỗ chí tử: `pwd` không bắt được lỗi này, vì cwd của shell hoàn toàn đúng trong khi đường dẫn tuyệt đối được chép lại trỏ đi nơi khác.

Bình luận @mhscentral mô tả biến thể nặng hơn: các commit của nhánh `feat/worker-logging` chui sang nhánh/worktree `feat/landing-page`, vì spec và plan được tạo ở một phiên đang đứng trên nhánh khác, và skill commit thẳng lên "nhánh hiện tại" mà không kiểm.

**Nguyên nhân gốc.** Không có gì trong vòng đời worktree ràng buộc "mọi đường dẫn trong phiên này phải nằm dưới gốc worktree". Và vì mục tiêu là **cây làm việc** chứ không phải lịch sử git, không có cơ chế git nào chặn được.

**Cách sửa.** Chưa sửa. Đề xuất trong issue: hook `PreToolUse` trên `Write`/`Edit`/`Read` kiểm tiền tố đường dẫn phải khớp gốc worktree (chốt cứng), cộng chỉ dẫn trong skill (chốt mềm). Quy trình phục hồi @takasek ghi lại: `git status --short` trên checkout chính để tìm file bị ghi nhầm, `git diff <file>` lấy diff, `git checkout -- <file>` khôi phục main, rồi `git apply` diff vào đúng worktree.

**Bài học áp cho ta.** Đây là bài học quan trọng nhất: **worktree là cô lập nhánh, không phải sandbox filesystem.** Nếu ta dùng worktree, hook kiểm tiền tố đường dẫn trên Write/Edit là bắt buộc, không phải tuỳ chọn. Và phải cấm chép đường dẫn tuyệt đối từ kết quả grep/subagent.

---

## 5. #2050 · Subagent commit lên `main` thay vì worktree · ĐANG MỞ

**Chế độ hỏng thật.** Worktree tạo bằng công cụ `EnterWorktree` gốc của harness. 14 task commit đúng. **Một** task commit vào checkout chính, lên nhánh `main`. Vì `main` trong lúc đó đã tiến lên (một PR khác merge vào), commit lạc rơi lên một `main` không hề chứa code tính năng trước đó — `main` mang code nửa vời, mồ côi. Nếu đã push thì rò ra remote.

**Cách phát hiện — điểm đáng học nhất.** Cổng review **không** bắt trực tiếp. Nó lộ ra vì diff review của task đó cho thấy các file tính năng trước đang bị **xoá** — điều bất khả với một task thuần thêm mới. Không có gì trong luồng khẳng định "subagent đã commit đúng nhánh"; nếu không có sự bất thường tình cờ đó thì đã lọt.

**Nguyên nhân gốc (người báo cáo tự nhận là chưa chắc).** cwd của subagent giải ra gốc repo chính chứ không phải worktree đang hoạt động. Không rõ vì sao chỉ đúng 1/17 subagent lệch (nó là subagent đầu tiên chạy trên tier model rẻ nhất).

**Cách né — đã kiểm chứng có tác dụng.** Người báo cáo thêm guard vào prompt dispatch: trước mọi `git add`/`git commit`, subagent phải xác minh `git rev-parse --show-toplevel` kết thúc bằng đúng đường dẫn worktree **và** `git branch --show-current` bằng đúng nhánh tính năng, sai thì `cd` vào hoặc huỷ. Sau đó **không tái diễn trong 13 task còn lại**. Đề xuất thứ hai: controller khẳng định sau mỗi commit bằng `git branch --contains <sha>`.

**Bài học áp cho ta.** Guard hai dòng này rẻ và đã được chứng minh trên thực địa — nên đưa vào hook `PreToolUse` chặn `git commit` của ta:
```
git rev-parse --show-toplevel   # phải khớp worktree kỳ vọng
git branch --show-current       # phải khớp nhánh kỳ vọng
```
Và khẳng định sau commit bằng `git branch --contains`, biến lỗi im lặng thành lỗi tất định.

---

## 6. #1543 · Subagent làm detach HEAD, 9–11 commit mồ côi · ĐÃ ĐÓNG

**Chế độ hỏng thật.** Một subagent *reviewer* chạy `git checkout <sha>` (không có `-- <path>`) để so sánh với commit cha. HEAD detach trên nhánh tính năng của controller. Ref nhánh đóng băng; mọi commit của các subagent sau đó chồng lên HEAD rời. 11 commit mồ côi trước khi controller nhận ra (dòng `git commit` in `[detached HEAD ...]` thay vì tên nhánh).

Tái hiện độc lập bởi @miguel-bandeira-infosistema: 9 commit mồ côi. Chi tiết chí tử: **cả hai lần checkout đều có diff rỗng** (cây làm việc đã khớp SHA đích), nên không có gì thay đổi nhìn thấy được khi HEAD rời ra. Thiệt hại chỉ lộ khi một subagent sau thấy một file sai kích thước và định "sửa" bằng cách viết lại code đang thiếu. Không subagent nào trong hơn 30 báo cáo nhắc tới lệnh `git checkout` — nó chạy như một bước "xác minh" không được báo cáo bên trong vòng lặp công cụ.

**Cách sửa (đã ship).** Thêm mục "Read-Only Review" vào prompt reviewer: review là chỉ-đọc trên checkout đang hoạt động; không sửa working tree, index, HEAD, hay trạng thái nhánh. Muốn xem revision khác thì **tạo worktree tạm riêng**: `git worktree add /tmp/review-<SHA> <SHA>`. Maintainer chọn phương án A (prompt) mà **không** lấy phương án B (controller kiểm `git symbolic-ref --short HEAD` sau mỗi lần subagent trả về) — để dành nếu còn tái diễn.

**Bài học áp cho ta.** Phiên "đọc/review" phải bị cấm cứng các lệnh làm dịch chuyển HEAD: `git checkout <sha>`, `git switch`, `git reset`, `git stash`. Thay bằng `git show <sha>:<path>`, `git diff`, `git log -p`, hoặc worktree tạm. Và đây là ứng viên số một cho hook chặn lệnh của ta, vì phòng bằng prompt đã được chứng minh là **không đủ** — cả 3/3 agent trong một báo cáo khác đều lờ lệnh cấm dạng văn xuôi.

---

## 7. #597 + #220 + #521 · Worktree không cho ta cô lập DB/cổng/env — maintainer nói thẳng là ngoài phạm vi · ĐÃ ĐÓNG

Đây là nhóm áp trực tiếp nhất vào bối cảnh "cùng một Postgres có dữ liệu thật".

**Chế độ hỏng thật.** #597: nhiều agent làm trên cùng dự án qua worktree **không hề biết** chúng cần hạ tầng riêng. Chúng dùng chung một database và một cổng dev server, nên **migration của một agent có thể phá hỏng và làm gián đoạn phiên của agent khác**. #220 nói cụ thể hơn: worktree chép cùng file `.env` của nhánh chính, gồm cả cấu hình database; mọi thay đổi schema ảnh hưởng tất cả worktree.

**Nguyên nhân gốc.** Không phải bug — là bản chất. Trả lời của @obra cho #220 gọn lỏn: đó chỉ là cách git worktree hoạt động. Khi đóng #597, đợt triage xác nhận `using-git-worktrees` hôm nay **không có chút logic cô lập cổng hay database nào**, chỉ có các bước cài dependency chung chung.

**Cách sửa / né.** Đóng như "venue call": phần cô lập thuộc về `CLAUDE.md` của chính dự án hoặc script setup nội bộ, không nhét vào core, vì cơ chế cô lập cổng/DB khác nhau quá nhiều theo stack. Phần "agent phải nhận biết và thông báo ngữ cảnh worktree" chuyển sang #1836.

**Nghịch lý kèm theo (#521).** Vì `.env` bị gitignore nên nó **không tồn tại** trong worktree mới — baseline test đổ với `DATABASE_URL is not defined`, thậm chí `npm install` hỏng vì postinstall (Prisma generate) cần biến env. Nên có hai lựa chọn đều xấu: không chép `.env` thì worktree không chạy được; chép `.env` thì hai worktree trỏ vào **cùng một Postgres**.

**Bài học áp cho ta.** Quyết định worktree của ta phải đi kèm quyết định dữ liệu, nếu không ta chỉ mua được cảm giác an toàn giả:
- Worktree giải quyết: đụng độ file mã nguồn, `git add -A` nuốt file của phiên khác, nhánh lẫn lộn.
- Worktree KHÔNG giải quyết: chung Postgres, chung backend đang chạy, chung cổng, chung `.env`.
- Với Postgres dữ liệu thật: mỗi phiên cần database hoặc schema riêng (`search_path` riêng), và biến `DATABASE_URL` phải sinh theo phiên chứ không chép từ `.env` gốc. Migration là thao tác tác dụng phụ toàn cục — phải có khoá, và phải là việc chỉ một phiên được làm.
- Ghi luật này vào `CLAUDE.md` của dự án; đó chính xác là chỗ upstream bảo phải để nó.

---

## 8. #989 · Chuỗi skill giả định mã nguồn đóng băng — phiên song song làm spec/plan lỗi thời · ĐÃ ĐÓNG

**Chế độ hỏng thật.** Spec viết ở thời điểm A, plan viết ở B, thực thi ở C. Nếu một phiên khác merge vào main giữa A và C: spec mô tả giải pháp cho một codebase không còn tồn tại; plan chứa đường dẫn file, số dòng, đoạn code không còn khớp; và **subagent thực thi không thể thích nghi** — chúng bám plan một cách máy móc, thường chạy trên model yếu hơn, không đủ sức đánh giá lại. Thay đổi đến giữa B và C thì hoàn toàn vô hình với pha thực thi.

**Cách sửa.** Đóng, với lập trường rõ của @obra: chống đạn cho tình huống "người khác sửa code trong cùng checkout khi bạn đang làm" không thuộc vòng lặp superpowers; **không nên có nhiều agent làm trong cùng một worktree cùng lúc**. (Cùng lập trường ở #1816: các kế hoạch không được kỳ vọng chạy đồng thời trong cùng worktree, kể cả trên main; kiểu đó kiểu gì cũng giẫm lên nhau — và ông lo hai agent đánh nhau vì *code* hơn là vì tài liệu.)

**Phản biện chưa được trả lời (@csillag).** main vẫn có thể dịch chuyển trong một phiên dài mà không cần hai agent chung worktree. `git rebase` cơ học chỉ bắt xung đột văn bản, **không bắt trôi ngữ nghĩa** — giả định của spec có thể đã bị vô hiệu ngay cả khi rebase sạch bong.

**Bài học áp cho ta.** Trước khi hợp nhất việc của một phiên, phải có bước **rebase + phân tích delta bằng model mạnh**: diff những gì main thay đổi từ điểm rẽ nhánh, và đánh giá xem chúng có vô hiệu hoá spec không. Rebase sạch không phải bằng chứng đúng đắn. Nếu delta lớn thì brainstorm lại chứ đừng vá.

---

## 9. #2118 · `origin/main` làm BASE_SHA trong diff hai chấm → reviewer thấy các dòng xoá không hề tồn tại · ĐANG MỞ, maintainer đã tái hiện

**Chế độ hỏng thật.** Skill gợi ý `BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main`, và hạ nguồn dùng dải **hai chấm** `BASE..HEAD`. `HEAD~1` luôn là tổ tiên nên hai chấm và ba chấm giống nhau. `origin/main` **thôi là tổ tiên ngay khi main dịch chuyển** — hai chấm so đỉnh với đỉnh, nên mọi thứ main có thêm sau điểm rẽ nhánh hiện ra như **các dòng xoá mà nhánh này đang thực hiện**. Reviewer subagent đọc diff nó không tự tạo ra, không có cách nào phân biệt xoá thật với xoá bịa, và báo cáo chúng như phát hiện thật.

Bảng tái hiện trong issue: cùng một nhánh, base là `HEAD~1` cho `1 file changed, 1 insertion(+)`; base là `origin/main` cho `2 files changed, 1 insertion(+), 200 deletions(-)`.

**Nguyên nhân gốc.** Nhầm ngữ nghĩa hai chấm/ba chấm. Điểm mấu chốt: lỗi **im lặng và không thường xuyên** — chỉ xuất hiện khi main dịch chuyển, nên người điều tra sau không tái hiện được.

**Cách sửa.** Một dòng: `BASE_SHA=$(git merge-base origin/main HEAD)`. Đây vốn đã là quy ước ở chỗ khác trong repo — `review-package` tính merge-base trước khi diff, nên nhánh final-review không dính lỗi còn nhánh per-task thì dính. Maintainer đã tái hiện độc lập và gắn nhãn bug.

**Bài học áp cho ta.** Chạy song song thì main **chắc chắn** dịch chuyển. Mọi công cụ diff/review của ta phải dùng `git merge-base` hoặc ba chấm. Nếu không, phiên A sẽ báo cáo rằng phiên B đã xoá code — và ta sẽ mất một buổi đuổi theo bóng ma.

---

## 10. #167 + #999 · Dọn dẹp worktree hỏng theo đúng ba kiểu · ĐÃ ĐÓNG

**Chế độ hỏng thật.** Ba lỗi khi kết thúc nhánh từ *bên trong* worktree — tức đúng chỗ người ta sẽ đứng:
1. `git checkout main` thất bại: `fatal: 'main' is already checked out at ...`. Git cấm cùng một nhánh được checkout ở hai worktree.
2. `git branch -d <nhánh>` thất bại vì worktree vẫn đang giữ nhánh đó. Thứ tự trong skill bị ngược — phải gỡ worktree trước, xoá nhánh sau.
3. Cảnh báo sai: công cụ gỡ worktree kêu "có 4 commit trên nhánh, gỡ sẽ mất vĩnh viễn" **dù các commit đó đã fast-forward merge xong**.

**Cách sửa.** Skill giờ `cd "$MAIN_ROOT"` trước khi `git worktree remove`, và ghi cả hai lỗi vào mục "Common Mistakes". Với cảnh báo sai, đề xuất kiểm `git merge-base --is-ancestor <feature> <base>` trước khi cảnh báo.

**Bài học áp cho ta.** Kịch bản dọn dẹp phải chạy **từ worktree chính**, và theo thứ tự: merge → gỡ worktree → xoá nhánh. Đồng thời phải dạy cả hai phiên rằng "nhánh chính đã bị phiên kia checkout" là trạng thái bình thường, không phải lỗi.

---

## 11. #2166 · Ràng buộc phiên và đích ghi thực tế lệch nhau · ĐANG MỞ (issue anh chỉ định)

**Chế độ hỏng thật.** Khi `using-git-worktrees` rơi về `git worktree add` thủ công trên Codex Desktop, git tạo worktree và nhánh hợp lệ, nhưng **tác vụ Codex vẫn gắn với checkout cha**. Giao diện tiếp tục hiển thị workspace/nhánh của cha trong khi agent chạy lệnh với worktree mới làm thư mục làm việc. Git tự nó nhất quán (`git worktree list`, `git -C <path> branch --show-current` đều đúng) — lệch nằm giữa git và trạng thái ràng buộc của tác vụ.

Bình luận thứ hai của tác giả mở rộng: đây không chỉ là nhãn UI. Tác vụ đó còn không có diff thời gian thực đáng tin cho worktree triển khai (số thay đổi hiển thị có thể thuộc ngữ cảnh cha), không lấy được trạng thái pull request, và không có đường nộp PR thủ công. Thành ra **không kiểm tra được thay đổi, không xác nhận được nhánh đang review, không nộp được việc** — hỏng ở khâu giao hàng, không phải khác biệt thẩm mỹ.

**Hướng khắc phục đề xuất.** Ràng buộc nguyên bản trước, fallback sau: phát hiện xem harness có thao tác tác vụ-gắn-worktree nguyên bản không; nếu là tác vụ mới thì tạo với môi trường `worktree`; nếu là tác vụ đã gắn cha thì fork nó rồi **chỉ tiếp tục ở con** — đừng tuyên bố là đã "gắn lại" tác vụ hiện tại, vì thao tác bàn giao không thể tự dịch chuyển luồng đang gọi. **Xác minh workspace, nhánh và HEAD hiệu dụng trước lần ghi đầu tiên.** Nếu không xác minh được ràng buộc thì dừng, fail-closed, không fallback im lặng.

**Bài học áp cho ta.** Trước lần ghi đầu tiên của mỗi phiên, in ra và xác minh bộ ba: đường dẫn worktree hiệu dụng, nhánh, HEAD. Đây là "hợp đồng khả chuyển" — cứ giả định UI/thanh trạng thái đang nói dối. Và hãy fail-closed: chưa xác minh được thì không ghi.

---

## 12. #1545 + #2113 · Phiên đứng im, và bằng chứng cũ bị báo cáo là kết quả mới · ĐANG MỞ (issue anh chỉ định)

**Chế độ hỏng thật (phần đứng im).** Hai skill mâu thuẫn: `executing-plans` liệt kê các trigger STOP nhạy (gặp blocker, test hỏng, chỉ dẫn không rõ, không hiểu chỉ dẫn) trong khi `subagent-driven-development` yêu cầu thực thi liên tục. Cái bảo thủ thắng mặc định. Kết quả ghi nhận: agent làm xong 1/10 call site rồi **im lặng 8 giờ 14 phút**; khi người dùng hỏi "sao dừng vậy", nó làm nốt 9 cái còn lại trong 9 phút — chưa từng có blocker nào. Trạng thái vẫn nguyên, chỉ thiếu chủ động. Làm nặng thêm: khi agent "dừng để hỏi", câu hỏi thường bị chôn thành một gạch đầu dòng trong bản tóm tắt thay vì là dòng cuối rõ ràng, nên người dùng chỉ thấy sự im lặng.

**Nguyên nhân cơ học (từ bình luận @oetiker ở #2113 — quan trọng cho ta).** Không phải timeout giết build. Khi Bash tool hết giờ, harness **chuyển lệnh sang chạy nền** và trả về kết quả nói vậy — subagent bèn kết thúc lượt, và shell nền **bị giết cùng lượt đó**. Không có cờ nào bắt subagent chặn đồng bộ. Mặc định timeout 2 phút chỉ là cái kích hoạt. Chi tiết đắt giá: cả ba implementer độc lập tự nghĩ ra cùng một cách chữa sai là `cargo test | tail -40`, thứ còn che luôn mã thoát của cargo sau mã của `tail`, khiến **suite đỏ đọc thành xanh**. Cấm bằng prompt ("đừng pipe", "đừng chạy nền") thất bại 3/3 lần.

**Chế độ hỏng thứ hai, nguy hiểm hơn (#2113 mục 1).** Agent được khôi phục sau đó đi tìm kết quả, thấy một file log trong scratchpad, và báo cáo nó như kết quả của mình. **Hai lần** một agent báo suite xanh mà thực ra thuộc code của task trước. Chỉ bắt được bằng cách so tên file và mtime của log với commit đang review. Nguyên tắc rút ra trong issue: một log mang tên chung chung không chứng minh được **code nào** đã xanh.

**Cách né đã kiểm chứng.**
- Đặt `timeout: 600000` tường minh cho mọi lệnh chạy lâu, phát biểu như một **hành động** trong prompt chứ không phải một lệnh cấm; nâng `BASH_DEFAULT_TIMEOUT_MS` trong settings để phòng khi agent quên.
- **Chẩn đoán ba nhánh khi một phiên im lặng**, vì cách chữa ngược nhau: cây sạch + có commit = đã xong âm thầm, đi đọc commit; cây bẩn + không có tiến trình build = đứng máy, tự chạy cổng kiểm; cây bẩn + build còn sống = đúng bug này, hãy **nhắn tiếp cho chính agent đó** thay vì dispatch lại, vì các sửa đổi vẫn nằm trong worktree nên dispatch lại sẽ nhân đôi công việc.
- Đặt tên log theo task (`t7-iphone.log` chứ không phải `uitest.log`) để buộc bằng chứng gắn với thứ nó xác minh.
- Bắt reviewer **tự chạy lại cổng kiểm trên code đã commit**, không bao giờ nhận số liệu của implementer. (Ghi chú: hiện `task-reviewer-prompt.md` lại bảo đừng chạy lại test cho đỡ tốn — chính chỗ đó gỡ mất lá chắn duy nhất bắt được log cũ.)

**Bài học áp cho ta.** Với hai phiên dùng chung một backend đang chạy, đây là chế độ hỏng có xác suất cao nhất mà ta chưa nghĩ tới: phiên A chạy test trên backend chung, phiên B khởi động lại backend hoặc chạy migration, phiên A đọc log cũ và báo "xanh". Nên: log/artefact đặt tên theo phiên, kiểm mtime so với commit, và cấm tin bằng chứng không tự khai danh tính.

---

## 13. #633 — đối trọng của sự cố `git add -A` của ta · ĐÃ ĐÓNG (không tái hiện được trên bản mới)

**Chế độ hỏng thật.** Ngược hoàn toàn với sự cố của ta: subagent `git commit` mà **không `git add`** các file mới tạo. Cây làm việc xanh, test xanh, subagent báo thành công — nhưng **trạng thái đã commit thì hỏng**. Bốn file panel không bao giờ được stage, trong khi `toolbar.ts` đã commit lại import cả bốn. Build sẽ đổ trên một checkout sạch. Không ai phát hiện vì mọi kiểm tra đều chạy trên cây làm việc.

**Cách sửa/né.** Thêm bước xác minh sau commit: chạy `git status` tìm file chưa track thuộc về công việc vừa làm, và amend nếu có; hoặc controller chạy `git status` sau mỗi subagent. Bình luận @Koroqe đề xuất mạnh hơn: một **agent riêng biệt** kéo về và build để xác minh, tách "triển khai" khỏi "kiểm chứng". Issue sau đó không tái hiện được trên Claude Code 2.1.81+ (system prompt đã có chỉ dẫn staging rõ) và được đóng.

**Bài học áp cho ta — đây là chỗ then chốt.** Sự cố `git add -A` của ta và lỗi này là hai đầu của cùng một cây kim:
- `git add -A` → nuốt file của phiên khác.
- `git add <đường dẫn cụ thể>` → sót file, commit hỏng mà cây vẫn xanh.

Nên lời giải không phải chọn một bên, mà là: **commit theo đường dẫn tường minh** + **kiểm `git status --porcelain` sau commit** + **xác minh trên bản checkout sạch** (clone/worktree tạm build lại). Và trong hook chặn lệnh của ta, `git add -A` / `git add .` nên bị chặn cứng khi có nhiều phiên hoạt động.

---

## 14. #1799 · Cái bẫy chờ sẵn kế hoạch "hook chặn lệnh" của ta · ĐANG MỞ

Đưa vào vì nó nói trực tiếp về ý định dùng hook của anh.

**Chế độ hỏng thật.** Script `review-package` chạy mọi lệnh git theo cwd, không dùng `-C`. Trong luồng worktree, phiên điều phối thường ở checkout chính còn việc triển khai ở worktree, nên cách duy nhất là ghép `cd <đường-dẫn> ; script <BASE> HEAD`. Hệ quả cho tầng quyền:
1. **Không thể allowlist tĩnh.** `BASE` là SHA khác nhau mỗi task, đường dẫn worktree khác nhau mỗi task, nên không luật quyền theo chữ nào khớp lần chạy sau — người dùng bị hỏi lại ở **mọi** bước review. Tách làm hai lời gọi Bash cũng không cứu được, vì harness reset cwd giữa các lời gọi công cụ, nên `cd` và script buộc phải chung một lời gọi.
2. **Xung đột với chính sách cấm lệnh ghép.** Nhiều tổ chức cấm `cd X ; Y` vì tầng quyền khớp cả dòng lệnh, nên không thể phê duyệt trước mà không mở một mẫu quá rộng.

Bình luận @arnaldop đính ảnh chụp lời nhắc thực tế, với lý do từ chối phân tích được của harness: lệnh chứa cú pháp shell không thể phân tích tĩnh.

**Cách sửa đề xuất.** Cho script nhận `-C DIR` ở đầu để gọi bằng **một lệnh duy nhất**, khi đó harness allowlist được bằng tiền tố đường dẫn chương trình ổn định dù SHA/đường dẫn thay đổi.

**Bài học áp cho ta.** Nếu ta xây hook chặn lệnh, hãy thiết kế **giao diện lệnh trước, hook sau**: mọi thao tác điều phối phải là một chương trình có đường dẫn cố định nhận tham số, không phải chuỗi lệnh ghép. Nếu không, ta sẽ rơi vào một trong hai hố: hỏi quyền liên tục đến mức mất tác dụng, hoặc whitelist rộng đến mức vô nghĩa. Và nhớ: `$(...)`, biến, dấu `;` sẽ khiến harness từ chối phân tích tĩnh.

---

# Tổng hợp: những gì sẽ hỏng với ta, theo thứ tự xác suất

| # | Sẽ vấp | Bằng chứng |
|---|---|---|
| 1 | Worktree không giam được ghi file; đường dẫn tuyệt đối chép từ grep/subagent trỏ về checkout chính, ghi im lặng | #1040 (mở, 3 bình luận, lỗi bị than nhiều nhất) |
| 2 | Postgres/backend/cổng vẫn dùng chung sau khi có worktree; migration của một phiên phá phiên kia | #597, #220, #521 (đều đóng, xác nhận ngoài phạm vi upstream) |
| 3 | File trạng thái/nhật ký điều phối dùng chung bị ghi đè, hoặc tệ hơn, khiến phiên kia **bỏ qua task** | #1942, #1936, #2012, #2045, #1888, #1816 |
| 4 | Commit rơi nhầm nhánh/worktree, phát hiện muộn qua diff bất thường | #2050, #1040 |
| 5 | `origin/main` dịch chuyển làm diff review hiện ra các dòng xoá ma | #2118 (maintainer đã tái hiện) |
| 6 | Một phiên im lặng, không phân biệt được "xong âm thầm" / "đứng máy" / "build còn chạy"; dispatch lại thì nhân đôi việc | #1545, #2113 |
| 7 | Bằng chứng cũ (log test, kết quả suite) bị báo cáo là kết quả mới | #2113 mục 1 |
| 8 | Lệnh review làm dịch chuyển HEAD, mồ côi commit, diff rỗng nên vô hình | #1543 |
| 9 | Hook chặn lệnh biến thành hỏi quyền liên tục vì lệnh ghép/SHA thay đổi | #1799 |
| 10 | Dọn dẹp cuối nhánh hỏng: không checkout được main, không xoá được nhánh, cảnh báo mất việc sai | #167, #999 |
| 11 | Plan/spec lỗi thời vì main dịch chuyển; rebase sạch không bắt được trôi ngữ nghĩa | #989 |

**Ba điều đáng làm ngay, mỗi điều đã có bằng chứng thực địa:**

1. **Guard trước mỗi commit** (đã chứng minh chặn đứng tái diễn ở #2050): kiểm `git rev-parse --show-toplevel` + `git branch --show-current` khớp kỳ vọng, sai thì huỷ. Kèm khẳng định sau commit bằng `git branch --contains`.
2. **Hook kiểm tiền tố đường dẫn trên Write/Edit** (đề xuất chính của #1040): mọi đường dẫn phải nằm dưới gốc worktree của phiên. `pwd` không đủ.
3. **Quyết định cô lập dữ liệu song song với quyết định worktree** (#597/#220): database hoặc schema riêng mỗi phiên, `DATABASE_URL` sinh theo phiên, migration là thao tác độc quyền có khoá. Ghi vào `CLAUDE.md` dự án — upstream nói rõ đó là chỗ duy nhất việc này thuộc về.

**Một điều đáng suy nghĩ lâu hơn.** Lập trường nhất quán của maintainer qua #989 và #1816 là: không nên có nhiều agent làm trong cùng một worktree cùng lúc, và mối lo lớn hơn không phải tài liệu kế hoạch mà là **hai agent đánh nhau vì chính đoạn code**. Toàn bộ các bản vá ở trên chỉ làm cho việc dùng chung ít nguy hiểm hơn, chứ không làm nó an toàn.