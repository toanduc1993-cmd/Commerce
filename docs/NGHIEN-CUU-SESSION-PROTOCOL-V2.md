# Nghiên cứu chuẩn bị `IBSHI_Skill_SESSION_PROTOCOL_V2`

**Lập ngày:** 17/08/2026 · **Nguồn:** khảo sát cách cộng đồng giải bài toán nhiều tác nhân AI
làm việc trên cùng một kho mã · **Trạng thái V1:** đang chạy, 174 dòng, đặt tại
`.claude/skills/IBSHI_Skill_SESSION_PROTOCOL_V1/`

## Đánh giá V1 sau khi đối chiếu với bên ngoài

Mô hình bốn tầng của V1 (file/git · cơ sở dữ liệu · tiến trình đang chạy · tác dụng phụ toàn cục)
**khớp với thực hành phổ biến** — tài liệu bên ngoài cũng nói ba thứ cần tách riêng là *mã nguồn*,
*dữ liệu*, và *biến môi trường*. Nên khung V1 không phải làm lại.

Nhưng V1 có **một điểm yếu gốc**: nó là **kỷ luật, không phải cơ chế.** Toàn bộ V1 chỉ có tác dụng
nếu phiên kia *có đọc* skill. Sự cố 14:09 ngày 17/08 chứng minh đúng điều đó — phiên kia chạy
`git add -A` và nuốt 5 file của phiên kiểm thử, trong khi luật cấm việc ấy đang nằm ngay trong repo.

**Hướng V2: chuyển từ "dặn dò" sang "chặn được".**

---

## Sáu hạng mục cho V2

### V2-1 · Cách ly bằng git worktree — biến đụng độ file thành bất khả thi

Thực hành phổ biến nhất: mỗi phiên một **worktree** riêng (một thư mục làm việc riêng, chung một
kho git). Hai phiên không thể ghi đè file của nhau vì chúng ở hai thư mục khác nhau.

Đáng chú ý: công cụ Agent trong Claude Code đã có sẵn tuỳ chọn `isolation: "worktree"`.

**Nhưng phải nói rõ giới hạn, nếu không sẽ tạo cảm giác an toàn giả:** worktree **chỉ tách file**.
Dự án này dùng **một** Postgres cổng 54321, **một** backend cổng 5005, **một** giao diện cổng 3000.
Hai worktree vẫn ghi vào cùng một cơ sở dữ liệu và vẫn tranh nhau cùng một máy chủ. Muốn tách thật
phải kèm **cơ sở dữ liệu riêng + cổng riêng + biến môi trường riêng cho từng phiên**.

Với dự án này, chi phí dựng cái đó không nhỏ (dữ liệu thật 3.465 chi tiết hợp đồng, 4.440 vật tư).
V2 nên nêu worktree như **lựa chọn có điều kiện**, kèm bảng cân nhắc, chứ không áp đặt.

### V2-2 · Một file bàn giao máy đọc được, thay cho bảng chôn trong prompt

Mẫu hình lặp lại ở nhiều nơi: **một file duy nhất trong repo làm nguồn sự thật** cho việc điều phối
— dạng `AGENT_HANDOFF.md`, hoặc `.coord/memory.yml` kiểu bảng đen chung, lưu "quyết định đã chốt,
câu hỏi còn mở, sản phẩm đã tạo, kết quả từng phiên".

V1 hiện bảo *"viết bảng phân vùng sở hữu vào prompt của phiên kia"*. Cách đó có hai chỗ hỏng:
bảng lạc hậu ngay khi phạm vi đổi, và mỗi lần giao việc lại phải chép tay lại.

Phiên hôm nay thiếu đúng thứ này: để biết ai vừa làm gì, em phải tự dò `git log` và nhật ký kiểm
toán. Nếu có một file `.coord/` ghi sẵn "phiên nào đang chạy, sở hữu vùng nào, đang dở việc gì" thì
câu hỏi đó trả lời trong một lần đọc.

**Cần thiết kế:** file đó cũng là tài nguyên dùng chung, nên phải có luật ghi của riêng nó
(một người ghi mỗi mục, hoặc mỗi phiên một mục con) — nếu không thì chính nó thành điểm xung đột.

### V2-3 · Guardrail chạy được — phần quan trọng nhất

Bên ngoài dùng cụm "anti-overwrite guardrails", "validation scripts", "acceptance gate": tức
**kiểm bằng máy trước khi cho qua**, không phải nhắc bằng chữ.

Áp cho dự án này, cụ thể và khả thi:
- **Chặn `git add -A`.** Claude Code có cơ chế hook trong `settings.json` — một hook chạy trước
  lệnh Bash có thể từ chối `git add -A` / `git add .` khi file bàn giao cho biết đang có phiên khác
  hoạt động. Đây là **cách duy nhất thật sự ngăn được sự cố 14:09**, vì nó không phụ thuộc việc
  phiên kia có đọc skill hay không.
- **Kiểm trước khi commit:** một script đối chiếu danh sách file đang stage với vùng sở hữu, báo đỏ
  nếu có file lạ.
- **Kiểm mốc dữ liệu:** một script in mốc hiện tại để so trước/sau, thay vì mỗi phiên tự gõ truy vấn.

### V2-4 · Một người ghi cho mỗi file

Nguyên tắc nêu rõ trong tài liệu bên ngoài: *xác định một người ghi duy nhất cho mỗi file khi có thể*.

V1 đang xử lý sổ thay đổi bằng luật "chỉ thêm, không sửa" — giảm rủi ro nhưng không triệt tiêu.
Cách mạnh hơn: **mỗi phiên ghi vào file riêng** (`CHANGES_LOG.d/<tên phiên>-<ngày>.md`) rồi gộp
định kỳ. Không còn hai phiên chạm cùng một file thì không còn gì để xung đột.

Cần cân nhắc với RULE CỨNG #1 và #2 của dự án (mọi thay đổi phải có mục trong `CHANGES_LOG.md`,
và tự nén khi vượt 500 dòng) — nên đây là thay đổi cần anh Hưng duyệt, không tự làm.

### V2-5 · Xung đột logic — V1 chưa nói gì

Điểm đắt giá nhất từ khảo sát: **worktree ngăn được ghi đè file, nhưng không ngăn được hai phiên
đưa ra giả định trái nhau.** Gộp lại thì từng phần đều đúng mà hệ thống vẫn hỏng.

Rất sát với tình huống sắp tới của dự án: phiên "Code vật tư" sẽ sửa phân quyền trên 41 route,
trong khi phiên kiểm thử viết ca kiểm dựa trên hành vi hiện tại. Nếu phiên code đổi mã lỗi trả về
hoặc đổi tên vai trò, bộ ca kiểm vừa viết sẽ sai mà **không có xung đột git nào báo cả**.

V2 cần một mục về việc này: chốt trước những **giao ước liên phiên** (tên vai trò, mã lỗi, tên
trường, đường dẫn API) và coi việc đổi chúng là thay đổi phải báo, không phải chi tiết nội bộ.

### V2-6 · Dấu vết nguồn gốc trong commit

Một dự án mô tả mục tiêu là *"provenance, parallel safety, and human visibility by design"* — nguồn
gốc, an toàn khi chạy song song, và con người nhìn thấy được.

Sự cố hôm nay làm mất đúng chữ đầu: commit `40252de` mang nhãn "nạp dữ liệu Excel" nhưng bên trong
có 5 file tài liệu kiểm thử. Không ai lần ngược được.

**Đề xuất rẻ:** quy ước thêm một dòng cuối commit ghi phiên nào tạo, ví dụ `Session: cpvt-kiemthu`.
Không cần công cụ gì, chỉ cần quy ước, và `git log --grep` là lọc được.

---

## Thứ tự đề xuất cho V2

| Ưu tiên | Hạng mục | Vì sao |
| --- | --- | --- |
| 1 | **V2-3** guardrail chặn `git add -A` | Ngăn được đúng sự cố đã xảy ra, không phụ thuộc phiên kia có đọc skill |
| 2 | **V2-5** xung đột logic | Sắp xảy ra thật với phiên "Code vật tư" |
| 3 | **V2-2** file bàn giao máy đọc được | Thay bảng chép tay, giảm việc lặp mỗi lần giao |
| 4 | **V2-6** dấu vết phiên trong commit | Rẻ nhất, chỉ là quy ước |
| 5 | **V2-4** một người ghi mỗi file | Cần anh Hưng duyệt vì đụng RULE CỨNG #1/#2 |
| 6 | **V2-1** worktree | Đáng làm nhưng tốn nhất, và không tự giải quyết được phần cơ sở dữ liệu |

## Đánh giá tính khả thi các nguồn GitHub (đo ngày 17/08/2026)

Số liệu lấy trực tiếp qua `gh api`, không dựa vào mô tả tự khai.

### Bảng sức khoẻ

| Kho | Sao | Người góp | Bản phát hành | Push cuối | Giấy phép | Kết luận |
| --- | ---: | ---: | ---: | --- | --- | --- |
| **obra/superpowers** | **272.929** | **38** | 12 | 13/08 | MIT | ✅ **Chín, đang sống — nguồn đáng học nhất** |
| ComposioHQ/awesome-claude-skills | 72.633 | — | — | 10/08 | **không có** | ⚠️ danh mục, 1.265 issue đều là đơn xin thêm skill |
| VoltAgent/awesome-agent-skills | 30.415 | — | — | 16/08 | MIT | ✅ danh mục tốt nhất để dò ý tưởng |
| VoltAgent/awesome-claude-code-subagents | 24.389 | — | — | 12/08 | MIT | ✅ danh mục, ít nợ (4 issue) |
| andyrewlee/awesome-agent-orchestrators | 1.420 | — | — | 15/08 | không có | ◐ danh mục nhỏ |
| herry2059/project-os-for-codex | 101 | **1** | 2 | 14/07 | Apache-2.0 | ❌ 101 sao / **5 commit** — sao nhiều hơn nội dung |
| WenyuChiou/agent-collab-skills | 22 | **1** | 1 | 11/07 | MIT | ❌ một người, nguội hơn 1 tháng |
| saieeshward/clan | 12 | 2 | 9 | 18/07 | MPL-2.0 | ❌ hai người, bug mở treo |
| grahama1970/agent-skills | 5 | 3 | 0 | 17/08 | không có | ❌ **260 issue là sổ việc riêng của tác giả** |
| HUAFIRE777/autorunne | 4 | 2 | **35** | 14/06 | MIT | ❌ 35 bản phát hành cho 59 commit — dấu hiệu lạ |
| fixiii98/agent-passport | 4 | **1** | 0 | 11/08 | MIT | ❌ **1 commit, tạo 6 ngày trước** — mới là ý tưởng |

### Đọc bảng này thế nào

**Nhóm "agent-handoff" mà em dẫn ở lần trước gần như vô dụng cho mình.** Toàn dự án một–hai người,
phần lớn đã nguội. Dấu hiệu rõ nhất là **mức độ tham gia**: 7 issue đang mở của `clan` đều **0 bình
luận**, kể cả một bug thật (`#57 Human Edit from Viewer not getting recorded`, mở 12/07, treo đến giờ).
Và trong 30 issue gần nhất của kho đó, 18 do chính tác giả tạo, 11 do một người nữa — tức **chỉ hai
người thật sự dùng**. Dựa vào những kho này cho một hệ thống sắp giao cho 20 người là rủi ro không
cần thiết.

**Ba danh mục lớn không phải công cụ, mà là danh sách.** Sao nhiều không có nghĩa là dùng được:
`ComposioHQ` có 72.633 sao nhưng **1.265 issue đang mở đều là đơn xin thêm skill** — đó là hàng chờ
duyệt, không phải lỗi. Kho này cũng **không có giấy phép**, nên chép nội dung về dùng trong dự án
công ty là chuyện phải cân nhắc.

**Và kết quả quan trọng nhất: tìm "parallel session" trong cả ba danh mục lớn → 0 kết quả.**
Chưa ai xuất bản skill cho đúng bài toán của mình. Skill V1 không trùng lặp với thứ có sẵn.

### Ngoại lệ đáng giá: `obra/superpowers`

Đây là thứ em bỏ sót ở lượt tìm trước. **272.929 sao, 38 người đóng góp, 12 bản phát hành, MIT,
push cách đây 4 ngày, 343 issue có trao đổi thật.** Khác hẳn nhóm trên về mọi mặt.

Kho này có sẵn bốn skill dính trực tiếp tới việc mình đang làm: `using-git-worktrees`,
`dispatching-parallel-agents`, `subagent-driven-development`, `verification-before-completion`
(và `writing-skills` — hữu ích khi làm V2).

**Ba điều rút ra sau khi đọc mã nguồn của họ:**

1. **"Never fight the harness."** Skill worktree của họ dò trước xem đã ở trong workspace cách ly
   chưa (`GIT_DIR != GIT_COMMON`), có **chốt chống nhầm với submodule**, và **hỏi ý người dùng trước
   khi tạo worktree**. Họ cảnh báo: dùng `git worktree add` tay trong khi harness đã có công cụ riêng
   sẽ tạo ra *"phantom state your harness can't see or manage"* — trạng thái ma mà harness không quản
   được. Claude Code ở đây **đã có sẵn** `EnterWorktree` và tuỳ chọn `isolation: "worktree"`, nên nếu
   V2 làm worktree thì phải dùng công cụ đó, không gõ git tay.

2. **Chính họ cũng đang vướng lỗi ở đúng chỗ này.** Issue `#2166` đang mở: *"Manual worktree fallback
   leaves current task bound to parent"*. Và `#1545`: *"executing-plans: STOP triggers cause silent
   multi-hour stalls"* — treo im mấy tiếng mà không báo gì. Đây là bằng chứng tốt rằng **worktree
   không phải làm xong là xong**; kho 272k sao với 38 người còn vướng thì mình cũng sẽ vướng.

3. **Điểm này khiến em phải chỉnh lại V2.** Skill `dispatching-parallel-agents` của họ ghi rõ phần
   *"Don't use when: ... **no shared state between investigations**"* — tức nguyên tắc của ngành là
   **chỉ chạy song song khi các nhánh việc KHÔNG dùng chung trạng thái.**

   Mình thì đang dùng chung: một Postgres, một backend, một giao diện. Theo chuẩn đó thì lẽ ra
   **không nên** chạy hai phiên song song như hiện nay.

   Nhưng cách ly thật (worktree + cơ sở dữ liệu riêng + cổng riêng) là việc lớn, mà dự án đang gấp
   bàn giao. Nên vị trí thật của mình là **vùng thứ ba: vẫn chạy song song, chấp nhận rủi ro có kiểm
   soát.** V2 phải nói thẳng điều đó thay vì để người đọc tưởng làm theo skill là an toàn — và phải
   ghi rõ mình đang ở nhánh "chưa cách ly", kèm danh sách cụ thể những gì vì thế mà có thể hỏng.

### Nên lấy gì, không lấy gì

| Việc | Quyết định |
| --- | --- |
| Thay skill của mình bằng thư viện có sẵn | ❌ Không có gì để thay — 0/3 danh mục có skill trùng bài toán |
| Cài `clan` / `autorunne` / `agent-passport` / `project-os-for-codex` | ❌ Quá non, một người, phần lớn đã nguội |
| Chép nội dung từ `ComposioHQ/awesome-claude-skills` | ⚠️ Kho không có giấy phép — cân nhắc khi dùng trong dự án công ty |
| **Đọc kỹ 4 skill của `obra/superpowers`** | ✅ **Làm** — MIT, chín, giải đúng vùng lân cận |
| **Dùng `EnterWorktree` của harness thay vì `git worktree add` tay** | ✅ Làm, nếu V2 đụng tới worktree |
| **Theo dõi issue `#2166` và `#1545` của họ** | ✅ Làm — đó là bản đồ những chỗ sẽ vấp |
| Dò thêm trong `VoltAgent/awesome-agent-skills` | ✅ Danh mục tốt nhất: MIT, 37 issue, push hằng ngày |

### Điều chỉnh thứ tự V2 sau khảo sát

| Ưu tiên | Hạng mục | Thay đổi so với bản trước |
| --- | --- | --- |
| 1 | **V2-3** guardrail chặn `git add -A` | giữ nguyên — vẫn là thứ ngăn được sự cố đã xảy ra |
| 2 | **V2-5** xung đột logic | **nâng lên** — đây chính là "shared state" mà chuẩn ngành bảo phải tránh |
| 2b | **MỚI — nói rõ mình chưa cách ly** | **thêm mới**: ghi thẳng vào skill rằng dự án đang chạy song song *có* dùng chung trạng thái, và liệt kê cụ thể cái gì vì thế mà có thể hỏng |
| 3 | **V2-2** file bàn giao máy đọc được | giữ nguyên |
| 4 | **V2-6** dấu vết phiên trong commit | giữ nguyên |
| 5 | **V2-4** một người ghi mỗi file | giữ nguyên |
| 6 | **V2-1** worktree | **hạ xuống + đổi cách làm**: dùng `EnterWorktree` của harness, không gõ git tay; và nêu rõ nó **không** giải quyết phần cơ sở dữ liệu |

## Nguồn tham khảo

- [github.com/topics/agent-handoff](https://github.com/topics/agent-handoff) — nhóm dự án về bàn giao giữa các tác nhân; đáng chú ý [clan](https://github.com/saieeshward/clan) (định dạng bàn giao, nhấn nguồn gốc + an toàn song song), [autorunne](https://github.com/HUAFIRE777/autorunne) (bộ nhớ dự án cục bộ kèm bằng chứng kiểm chứng), [agent-passport](https://github.com/fixiii98/agent-passport)
- [WenyuChiou/agent-collab-skills](https://github.com/WenyuChiou/agent-collab-skills) — bộ skill cộng tác đa tác nhân: chia việc, gộp kết quả, bộ nhớ chung `.coord/memory.yml`, cổng nghiệm thu trước khi gộp
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) · [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — hai bộ sưu tập lớn để dò thêm
- [VoltAgent/awesome-claude-code-subagents — multi-agent-coordinator](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/09-meta-orchestration/multi-agent-coordinator.md)
- [Parallel Claude Code Agents: Safe Workflow Guide](https://www.aakashx.com/blog/parallel-claude-code-agents/) · [Claude Code Worktrees: Parallel Sessions Without Conflicts](https://claudefa.st/blog/guide/development/worktree-guide) · [Parallel Agentic Development With Git Worktrees](https://www.mindstudio.ai/blog/parallel-agentic-development-git-worktrees)
