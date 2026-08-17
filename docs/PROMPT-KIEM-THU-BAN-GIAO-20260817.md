# Kiểm thử hệ thống Vật tư trước khi bàn giao cho 20 người dùng qua LAN

*Prompt phiên làm việc — soạn ngày 17/08/2026*

## 1. BỐI CẢNH

Workspace ĐÚNG: `/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/VẬT TƯ`
Remote: `toanduc1993-cmd/Commerce.git`

⛔ Bản cũ ở `~/Desktop/IBSHI/01 IBSHI THƯƠNG MẠI/.../VẬT TƯ` là bản chụp tháng 4 — KHÔNG đụng.

**Trạng thái thật, đọc kỹ, đừng giả định:**

- **Chưa commit gì.** 10 file sửa + 8 file chưa theo dõi. Hai file `docs/master-table-review-20260530.html` và `docs/pr-page-ui-review.html` là rác tháng 7 — để ngoài commit.
- Phiên 13/08 vá 16 mục nhánh so sánh giá → duyệt → tạo đơn hàng (`docs/RA-SOAT-LOGIC-SO-SANH-DUYET-BAO-GIA-20260813.md`).
- Phiên 14/08 nghiệm thu bằng mắt: bảng so sánh giá và chấm giá thấp nhất theo từng loại tiền **ĐẠT**. Phát hiện lỗi chặn: cookie CSRF `SameSite=None` thiếu `Secure` → Chrome vứt cookie, mọi lệnh ghi trên `/duyet` trả 403, **Safari vẫn chạy nên 2,5 tháng không ai thấy**. Đã vá 1 dòng (`backend/src/middleware/csrfProtection.js:35`) và ghi luật **R-18**.
- Kiểm lại ngày 17/08: backend đã khởi động lại, `Set-Cookie` là `SameSite=Lax`, chốt an toàn đã gỡ.

**Mốc dữ liệu đo ngày 17/08:** PurchaseOrder 0 · ContractDetail 3.465 · dòng đã duyệt 522 · `selectedAt` 17 · User 1 (ADMIN).
*(Mốc phiên 14/08 là 2.994 / 508 / 0 — dữ liệu đã tăng do sử dụng thật, không phải do lỗi.)*

**Nợ đã biết, đừng báo lại như lỗi mới:** lỗi TypeScript có sẵn ở `kiem-tra-ton-kho/page.tsx:463` · 11 file chứa `localhost:5005` (đều đúng mẫu env, chỉ vi phạm điều khoản grep của R-13) · `CHANGES_LOG.md` vượt ngưỡng 500 dòng của RULE CỨNG #2 · thẻ tổng NCC đọc `totalQuote` nên hiện 0 ₫ trong khi bảng bên dưới ra số thật · 32 báo giá phạm vi `X` nhưng vẫn có đơn giá > 0 nên lọt qua P0-3 · rời chế độ PER_BID không gỡ dòng đã duyệt (`bidSelectionModeController.js:64-70`) · lịch sử migration lệch vì DDL áp tay bằng `psql`.

## 2. MỤC TIÊU

Đưa ra kết luận **bàn giao được / bàn giao có điều kiện / chưa bàn giao được**, có căn cứ kiểm chứng được, cho tình huống 20 người dùng thật chạy qua LAN trên dữ liệu sạch.

## 3. ĐIỀU KIỆN BÀN GIAO ĐÃ CHỐT

| Hạng mục | Đã chốt |
|---|---|
| Bản đem kiểm | Commit trước, rồi kiểm bản đã commit (vẫn KHÔNG push) |
| Người dùng | 20 người, nhiều nhóm/bộ phận khác nhau |
| Cách truy cập | Qua LAN |
| Dữ liệu | Làm sạch trước khi bàn giao — người dùng nhập mới |
| Phân hệ | Đủ hết, không cắt bớt |
| Nhiều người cùng lúc | Kiểm nhẹ: 3 người cùng thao tác trên một gói. KHÔNG kiểm tải. |

## 4. PHẠM VI

Đủ 8 bước quy trình mua sắm: Yêu cầu mua (PR) → Kiểm tra tồn kho → Làm rõ kỹ thuật → Yêu cầu & Báo giá → So sánh & Duyệt → Hợp đồng → Hàng về & QC → Thanh toán. Cộng dữ liệu chủ: Nhà Cung Cấp, Danh Mục Vật Tư, Lịch Sử Mua Hàng. Cộng đăng nhập và **phân quyền theo 6 vai trò** `MUA_HANG | KY_THUAT | QC | WAREHOUSE | BOD | ADMIN`.

**Ma trận trình duyệt — bắt buộc cả hai: Chrome và Safari.** Không phải cho đủ lệ: lỗi 14/08 chỉ hiện trên Chrome. Mọi ca có ghi dữ liệu phải chạy trên cả hai.

**Ma trận vai trò — bắt buộc.** 20 người ở các bộ phận khác nhau nghĩa là phân quyền là tính năng chính, không phải phụ. Mỗi phân hệ phải kiểm ít nhất: một vai trò được phép (thành công) và một vai trò không được phép (bị chặn 403, và giao diện cũng không hiện nút).

**Ngoài phạm vi** trừ khi anh Hưng yêu cầu: kiểm tải, kiểm xâm nhập, kiểm trên điện thoại.

## 5. NGUYÊN TẮC CỨNG

- KHÔNG `git push` (RULE CỨNG #0). Được phép commit vì anh Hưng đã ra lệnh; push thì không.
- KHÔNG `prisma migrate dev` (RULE CỨNG #6) — kể cả khi làm sạch dữ liệu. Dùng script cắt bảng có chủ đích.
- KHÔNG chạy máy chủ qua Claude harness (RULE CỨNG #4).
- KHÔNG xoá file, chỉ chuyển `_archive/`. KHÔNG xoá `_backup_BidQuoteVendor_order_20260813`, `_backup_test_po_20260813`.
- KHÔNG tự dự kiến thời gian.
- **Sao lưu toàn bộ CSDL ra file trước khi làm sạch.** Đây là thao tác không lùi được. Chưa chứng minh phục hồi được từ bản sao lưu thì chưa được làm sạch.
- Nút "Tạo PO / HĐ" tạo đơn hàng THẬT và khoá gói. Trước mọi ca có ghi: chụp ảnh nguyên trạng, bật chốt an toàn tầng CSDL, soạn sẵn script khôi phục.
- Hai nguồn số liệu vênh nhau → HỎI, không tự chọn bên nào.
- Viết tắt giải thích lần đầu.

## 6. CÁC BƯỚC

**A. Dọn hiện trường + xác nhận bản vá CSRF.** Gỡ `_guard_no_po_20260814` nếu còn. Xác nhận `Set-Cookie` là `SameSite=Lax` và một lệnh duyệt NCC **trên Chrome** trả 200 thay vì 403. Chưa qua bước này thì mọi bước sau vô nghĩa.

**B. Commit.** Tách 2 file HTML rác ra ngoài. Thông điệp gợi ý: `fix(bid): sửa P0/P1 logic so sánh giá → duyệt + nối 3 chế độ chọn thầu`, và một commit riêng cho bản vá CSRF. Ghi lại mã commit vào báo cáo. **Không push.**

**C. Rà và cập nhật bộ kiểm thử ĐÃ CÓ** — `deploy/uat/UAT_SCENARIOS.md` (7 kịch bản), `deploy/uat/UAT_CHECKLIST.md`, `deploy/PRE_GOLIVE_CHECKLIST.md`, `deploy/uat/smoke_test.sh`. Đối chiếu với hệ thống hiện tại, đánh dấu ca nào còn đúng, ca nào lạc hậu, bổ sung ca còn thiếu: ma trận vai trò, ma trận trình duyệt, luồng LAN. Không viết tài liệu mới trùng nội dung.

**D. Chốt hạ tầng LAN.** IP tĩnh hoặc tên máy thay cho IP cấp động. `ALLOWED_ORIGINS` trong `backend/.env` và `NEXT_PUBLIC_API_URL` trong `frontend/.env.local` trỏ đúng. **Quyết định chế độ chạy**: nếu `NODE_ENV=production` thì phải có HTTPS thật (dùng `deploy/nginx/`, thư mục `certs/` đang rỗng), vì cookie `__Host-` không sống qua HTTP; nếu không dựng HTTPS thì phải nêu rõ hệ quả bảo mật của việc chạy chế độ phát triển cho 20 người.

**E. Tạo 20 tài khoản.** CSDL mới có 1 ADMIN, **không có trang quản lý người dùng**, không có script tạo hàng loạt. Đề xuất cách làm và thực hiện: viết script, hoặc bổ sung trang quản trị. Mỗi người đúng vai trò, mật khẩu ban đầu riêng, bắt buộc đổi ở lần đăng nhập đầu.

**F. Kiểm khói toàn hệ trên bản đã commit.** Mọi trang tải 200 · đăng nhập/đăng xuất · API không thẻ → 401 · lệnh ghi thiếu CSRF → 403 · **lệnh ghi đủ CSRF → 200**. Cặp cuối phải đủ hai vế — đó là bài học R-18.

**G. Kiểm luồng đầu-cuối trên dữ liệu thật** một lượt: PR → báo giá → so sánh → duyệt → tạo đơn hàng → hợp đồng → hàng về & QC → thanh toán. Đây là ca duy nhất được tạo đơn hàng thật: chọn gói nhỏ, chụp ảnh trước, có script hoàn tác.

**H. Kiểm ma trận vai trò và trình duyệt** theo bảng ở mục 4.

**I. Làm sạch dữ liệu.** Sao lưu ra file và **chứng minh phục hồi được** trước. Chốt với anh Hưng bảng nào xoá, bảng nào giữ — đề xuất: giữ dữ liệu chủ (vật tư, nhà cung cấp, dự án), xoá dữ liệu giao dịch (PR, báo giá, duyệt, đơn hàng, hợp đồng, hoá đơn, nhật ký). Viết thành script chạy lại được trong `backend/scripts/`, không gõ tay từng lệnh.

**J. Kiểm khói lại trên dữ liệu sạch.** Hệ thống rỗng dễ lộ lỗi mà dữ liệu đầy che mất: chia cho 0, danh sách rỗng, trang trắng. Chạy lại F và một lượt G rút gọn.

**K. Sao lưu định kỳ và đường lùi.** Xác nhận `deploy/launchd/com.ibshi.vattu.backuppg.plist` chạy thật — lưu ý các job launchd của dự án này từng lỗi quyền từ 24/07, đừng tin là nó đang chạy. Chứng minh phục hồi từ bản sao lưu.

**L. Báo cáo + quyết định Go/No-Go** theo mẫu có sẵn ở cuối `deploy/PRE_GOLIVE_CHECKLIST.md`.

## 7. PHẢI TRẢ LỜI ĐƯỢC TRƯỚC KHI BÀN GIAO

- Chạy chế độ nào, có HTTPS không, và nếu không thì chấp nhận rủi ro gì?
- 20 tài khoản tạo bằng cách nào, ai quản lý về sau khi chưa có trang quản trị người dùng?
- Mật khẩu CSDL đang công khai trên GitHub (khoản C16 đã hoãn có chủ ý). Trước đây chỉ mình anh dùng nên hoãn được; giờ 20 người trên LAN thì còn hoãn được không?
- IP LAN cố định thế nào để DHCP không làm đứt cả hệ thống?
- Ai hỗ trợ người dùng khi có lỗi, và lỗi báo về đâu?
- Có bản sao lưu chạy tự động và đã thử phục hồi chưa?

## 8. NGHIỆM THU

- [ ] Đã commit, ghi rõ mã commit trong báo cáo, chưa push.
- [ ] Bản vá CSRF xác nhận chạy trên Chrome, không chỉ Safari.
- [ ] Bộ kiểm thử trong `deploy/` đã cập nhật đúng hệ thống hiện tại; mỗi ca có kết quả mong đợi ghi TRƯỚC khi chạy.
- [ ] Mỗi ca có ĐẠT / KHÔNG ĐẠT / KHÔNG CHẠY ĐƯỢC kèm bằng chứng: nguyên văn chuỗi trên màn hình, mã HTTP, hoặc kết quả truy vấn.
- [ ] Ma trận vai trò: mỗi phân hệ có ít nhất 1 ca được phép và 1 ca bị chặn.
- [ ] Ma trận trình duyệt: mọi ca ghi dữ liệu chạy trên cả Chrome và Safari.
- [ ] 20 tài khoản đã tạo, đăng nhập được, đúng quyền.
- [ ] Đã sao lưu trước khi làm sạch và đã thử phục hồi thành công.
- [ ] Kiểm khói chạy lại trên dữ liệu sạch, không có trang trắng hay lỗi chia cho 0.
- [ ] Kết luận Go/No-Go rõ ràng, không nước đôi. Mọi chỗ KHÔNG ĐẠT nói thẳng, kèm ảnh chụp hoặc nguyên văn lỗi. Không viết "có vẻ ổn".

## 9. ĐẦU RA

1. Cập nhật `deploy/uat/UAT_SCENARIOS.md`, `deploy/uat/UAT_CHECKLIST.md`, `deploy/PRE_GOLIVE_CHECKLIST.md`.
2. Script làm sạch dữ liệu + script sao lưu/phục hồi trong `backend/scripts/`, chạy lại được.
3. Script hoặc trang tạo 20 tài khoản.
4. Báo cáo trong chat, kết luận Go/No-Go ở dòng đầu.
5. Mục mới trong `CHANGES_LOG.md` cho mọi lỗi phát hiện và mọi thứ đã sửa.
6. Cập nhật `_sessions/_shared/CHECKPOINT_cpvt.md`.
7. Danh sách việc chặn bàn giao, xếp theo mức nghiêm trọng.
