# Vấn đề cần sửa trước khi bàn giao

**Lập ngày:** 17/08/2026 · **Nguồn:** phiên kiểm thử trước bàn giao
**Bối cảnh bàn giao:** 20 người dùng qua LAN, **12 người kiểm thử đồng thời trên toàn bộ tính năng**
**Kết luận hiện tại:** ❌ **CHƯA BÀN GIAO ĐƯỢC** — còn 4 việc chặn

> Tài liệu này chỉ **mô tả vấn đề**, không sửa code. Việc sửa do session **"Code vật tư"** thực hiện
> theo prompt ở `docs/PROMPT-SUA-LOI-TRUOC-BAN-GIAO.md`. Session kiểm thử không đụng vào mã nguồn
> để tránh hai phiên sửa chồng lên nhau.

---

## Mức 0 — CHẶN BÀN GIAO

### BG-01 · Phân quyền theo vai trò chỉ phủ 13% số route

**Vấn đề.** Hệ thống có 6 vai trò (`MUA_HANG | KY_THUAT | QC | WAREHOUSE | BOD | ADMIN`) và có sẵn
hàm chặn `restrictTo` ở `backend/src/middleware/authMiddleware.js:40`. Nhưng đếm thực tế:

| Chỉ số | Số lượng |
| --- | --- |
| Tổng route | 92 |
| Có chặn theo vai trò | **12** (13%) |
| Không chặn | 80 (87%) |
| **Route GHI dữ liệu không chặn vai trò** | **41** |

Nghĩa là **bất kỳ ai đăng nhập cũng làm được mọi thứ**. Một nhân viên kho có thể duyệt nhà cung cấp
và tạo đơn hàng hàng tỷ đồng. Với 20 người ở các bộ phận khác nhau, đây là rủi ro nghiệp vụ thật,
không phải rủi ro lý thuyết.

**Vài route ghi dữ liệu đang bỏ ngỏ:**
- `POST /api/v1/bid-analyses/:id/create-po` — **tạo đơn hàng thật + khoá gói**
- `DELETE /api/v1/bid-analyses/:id` — **xoá cả đợt báo giá**
- `POST /api/v1/bid-analyses/:id/select-vendor` — giao cả gói cho một NCC
- `PATCH /api/v1/bid-analyses/:bidId/items/:itemId/select-vendor` — duyệt từng dòng
- `POST /api/v1/prs/import` — nhập yêu cầu mua từ Excel
- `POST /api/v1/pos/generate`, `POST /api/v1/receipts/receive`

**Trớ trêu đáng chú ý:** route **cũ** `/bids/:bidId/select-winner` **có** chặn (`BOD, ADMIN`,
`procurementRoutes.js:106`) nhưng route **đang thực sự được dùng** `/bid-analyses/:id/select-vendor`
thì không. Lớp phân quyền được viết cho thế hệ route trước rồi không theo kịp.

**Đề xuất.** Rà từng route trong 41 route ghi dữ liệu, gán `restrictTo` đúng vai trò. Cần anh Hưng
duyệt bảng phân vai trước khi code — ai được duyệt NCC, ai được tạo đơn hàng, ai được xoá.
Đồng thời giao diện phải **ẩn nút** với vai trò không có quyền, chứ không để bấm rồi mới báo 403.

**Kiểm lại.** Với mỗi phân hệ: một vai trò được phép → thành công; một vai trò không được phép →
**403 và không thấy nút**. Bảng ca kiểm đã có sẵn ở phần L của `deploy/uat/UAT_CHECKLIST.md`.

---

### BG-02 · Chưa có 20 tài khoản, và không có màn hình quản lý người dùng

**Vấn đề.** Cơ sở dữ liệu hiện có đúng **1 tài khoản ADMIN**. Cần 20 tài khoản cho bàn giao và
**12 tài khoản dùng được ngay** cho đợt kiểm thử đồng thời.

Có sẵn `POST /api/v1/admin/users` (chỉ ADMIN, `procurementRoutes.js:291`) nên tạo được bằng lệnh gọi
API. Nhưng **không có màn hình quản lý người dùng** trong `frontend/src/app/` — tạo xong thì không ai
sửa vai trò, khoá tài khoản, hay đặt lại mật khẩu cho người quên được. Trang `/settings` chỉ cho
người dùng tự đổi mật khẩu của chính mình.

**Đề xuất.** Hai phần, có thể tách:
1. **Gấp:** script tạo tài khoản hàng loạt từ một file danh sách (tên, tài khoản, vai trò, bộ phận),
   mật khẩu ban đầu ngẫu nhiên, bắt buộc đổi ở lần đăng nhập đầu.
2. **Trước khi bàn giao thật:** màn hình quản trị người dùng cho ADMIN — thêm, sửa vai trò, khoá,
   đặt lại mật khẩu.

**Kiểm lại.** 12 tài khoản đăng nhập được đồng thời, đúng vai trò, đổi mật khẩu lần đầu chạy đúng.

---

### BG-03 · Mã đơn hàng sinh kiểu "đếm rồi chèn" — đụng nhau khi nhiều người bấm cùng lúc

**Vấn đề.** `backend/src/controllers/bidAnalysisController.js:1674-1686`:

```js
const seqCount = await prisma.purchaseOrder.count({          // đếm NGOÀI giao dịch
  where: { poCode: { startsWith: `PO-${yymmdd}-` } },
});
seqStart = seqCount;
const result = await prisma.$transaction(async (tx) => {
  ...
  const poCode = `PO-${yymmdd}-${String(seq).padStart(3, '0')}`;
```

Số thứ tự lấy bằng cách **đếm số đơn hàng đã có rồi cộng thêm**, và phép đếm nằm **ngoài** giao dịch.
`poCode` có ràng buộc duy nhất (`schema.prisma:622`). Nên khi hai người bấm "Tạo PO" gần như cùng lúc,
cả hai cùng đếm ra N, cùng sinh `PO-260817-001`, và **một người sẽ nhận lỗi hệ thống 500** do vi phạm
ràng buộc duy nhất — không phải thông báo dễ hiểu.

Với 1 người dùng thì gần như không bao giờ gặp. **Với 12 người kiểm đồng thời thì chắc chắn gặp.**

**Đề xuất.** Dùng một nguồn sinh số an toàn với truy cập đồng thời — dãy số (sequence) của Postgres,
hoặc đặt phép đếm vào trong giao dịch với mức cô lập đủ chặt, hoặc bắt lỗi trùng rồi thử lại. Kèm
thông báo tiếng Việt dễ hiểu thay cho lỗi 500.

**Kiểm lại.** Hai máy bấm "Tạo PO" cùng lúc trên hai gói khác nhau → cả hai phải thành công với hai
mã khác nhau, không ai nhận lỗi 500.

---

### BG-04 · Chạy chế độ production trên LAN qua HTTP sẽ làm chết toàn bộ thao tác ghi

**Vấn đề.** `backend/src/middleware/csrfProtection.js:25-31`:

```js
cookieName: isProd ? '__Host-ibshi_csrf' : 'ibshi_csrf',
sameSite:   isProd ? 'strict' : 'lax',
secure:     isProd ? true : false,
```

Tiền tố `__Host-` theo chuẩn **bắt buộc phải có HTTPS**. Nếu đặt `NODE_ENV=production` rồi chạy
`http://192.168.x.x` trên LAN, trình duyệt sẽ **không lưu cookie**, và mọi lệnh ghi trả **403** —
đúng lỗi đã gặp ngày 14/08 nhưng nặng hơn vì lần này không trình duyệt nào thoát.

Có sẵn cấu hình `deploy/nginx/` nhưng thư mục `deploy/nginx/certs/` đang rỗng.

**Đề xuất.** Cần anh Hưng chốt một trong hai:
- **Dựng HTTPS** bằng cấu hình nginx đã có (chứng chỉ tự ký cho LAN là đủ), rồi chạy production.
- **Chạy chế độ phát triển**, và ghi rõ những lớp bảo vệ bị mất khi làm vậy.

Dù chọn cách nào, code nên **báo lỗi rõ ràng lúc khởi động** nếu phát hiện `NODE_ENV=production`
mà không có HTTPS, thay vì để người dùng gặp 403 không hiểu vì sao.

**Kiểm lại.** Trên đúng cấu hình sẽ bàn giao: đăng nhập rồi ghi một bản ghi từ **máy khác** qua LAN,
bằng **cả Chrome và Safari** → phải 200.

---

## Mức 1 — CAO (nên sửa trước khi 12 người vào kiểm)

### C-01 · Thẻ tổng nhà cung cấp hiện 0 ₫ trong khi bảng ngay bên dưới ra số thật

Thẻ tổng đọc cột `totalQuote` lưu sẵn trong cơ sở dữ liệu (`frontend/src/app/duyet/page.tsx:418`),
còn bảng bên dưới cộng từ báo giá thật. Ví dụ đo được trên gói `BID-VPI095-2605-VTC-003`:
NCC `Hùng Nguyên` thẻ hiện **0 ₫** nhưng cộng cột "Thành tiền" ra **36.171.711 ₫**. Hai con số đá nhau
trên cùng một màn hình — người dùng sẽ tin cái nào?

Đã có sẵn hàm tính đúng `totalForVendor()` trong `frontend/src/lib/bid-compare.ts:105` nhưng thẻ không dùng.

**Đề xuất.** Cho thẻ dùng `totalForVendor()`, hoặc tính lại `totalQuote` khi nạp dữ liệu. Cần quyết
định cái nào là nguồn đúng.

### C-02 · Báo giá ghi "không chào" nhưng vẫn có đơn giá thì lọt qua lớp chặn P0-3

Toàn kho có **32 báo giá** ghi phạm vi `X` (nhà cung cấp không chào) **nhưng đơn giá vẫn > 0**.
Lớp chặn P0-3 ở `bidAnalysisController.js:1648` chỉ kiểm `!(gia > 0)`, nên loại này đi lọt và **vẫn tạo
được đơn hàng** cho một nhà cung cấp đã ghi rõ là không chào. Đây là mặt trái của đúng cái lỗi P0-3 vá.

Ba nơi đang hiểu khác nhau về cùng dữ liệu này: bảng so sánh thì hiện giá và cho phép thắng "rẻ nhất";
chế độ tự chọn giá thấp nhất thì loại ra (yêu cầu phạm vi `V`); lớp chặn tạo đơn hàng thì cho qua.

**Đề xuất.** Thống nhất một quy tắc cho cả ba nơi. Cần anh Hưng chốt: phạm vi `X` mà có giá thì tính
là có chào hay không?

### C-03 · Rời chế độ "chọn 1 NCC cho cả gói" không dọn dẹp

`backend/src/controllers/bidSelectionModeController.js:64-70` — khi rời chế độ `PER_BID`, code chỉ xoá
cờ nhà cung cấp trúng, **không** gỡ các dòng đã duyệt và **không** trả trạng thái gói về `OPEN`.
Bốn chế độ còn lại đều tự dọn. Hậu quả: đổi chế độ xong, gói vẫn mang trạng thái đã chọn và nút
"Tạo PO" vẫn sống với dữ liệu của chế độ cũ.

### C-04 · Không có khoá chống ghi đè khi nhiều người sửa cùng một chỗ

Không thấy cơ chế khoá lạc quan (kiểu kiểm phiên bản trước khi ghi). Với **12 người kiểm đồng thời**,
hai người mở cùng một gói, người A duyệt, người B duyệt tiếp trên màn hình cũ → **ghi đè im lặng**,
không ai biết. Nhật ký kiểm toán có ghi lại (P0-4) nhưng người dùng không thấy cảnh báo.

**Đề xuất.** Tối thiểu: khi ghi, kiểm `updatedAt` mà giao diện đang giữ có khớp bản ghi trong CSDL
không; lệch thì báo "dữ liệu đã thay đổi, hãy tải lại" thay vì ghi đè.

---

## Mức 2 — TRUNG BÌNH (không chặn, nên dọn)

| Mã | Vấn đề | Ghi chú |
| --- | --- | --- |
| TB-01 | 11 file trong `frontend/src` còn chuỗi `localhost:5005` | Đều đúng mẫu `process.env… \|\| '…'` mà R-13 gọi là ĐÚNG. Vi phạm chỉ là điều khoản "grep phải ra 0". Nên gom về `api.ts` hoặc sửa lại lời văn của R-13 cho khớp thực tế. |
| TB-02 | Lịch sử migration lệch | Hai cột `selectedAt`/`selectedBy` và ràng buộc `@@unique([bidId, vendorOrder])` áp tay bằng `psql`; `backend/prisma/migrations/` không biết đến chúng. Dựng môi trường mới từ đầu sẽ thiếu. |
| TB-03 | `CHANGES_LOG.md` vượt ngưỡng 500 dòng của RULE CỨNG #2 | Chưa chạy `./scripts/compact_logs.sh`. |
| TB-04 | Giới hạn tải file 20 lần/10 phút mỗi IP | `rateLimiter.js:35`. Ngày kiểm thử người dùng nhập Excel nhiều lần có thể chạm trần và tưởng là lỗi. Cân nhắc nới trong đợt kiểm. |
| TB-05 | Hai file HTML rác đã bị commit | `docs/master-table-review-20260530.html`, `docs/pr-page-ui-review.html` vào trong commit `4c8432c`. Không đáng sửa lịch sử, chuyển `_archive/` khi tiện. |

---

## Đã kiểm và ĐẠT — không cần đụng tới

| Hạng mục | Bằng chứng |
| --- | --- |
| Bản vá CSRF (R-18) chạy trên Chrome | `PATCH .../select-vendor` → **200** (trước đó 403 bốn lần) |
| Dấu vết phê duyệt P1-4 | `selectedAt` + `selectedBy` đóng dấu đủ |
| Nhật ký kiểm toán P0-4 | `BID_ITEM_VENDOR_SELECTED` ghi `from → to` |
| Chặn dòng 0 đồng P0-3 | HTTP **400**, `Đơn giá = 0 (phạm vi "X" — NCC không chào)`, không sinh đơn hàng |
| Bảng so sánh giá P0-1 | 9 dòng × 4 cột khớp tuyệt đối cơ sở dữ liệu |
| Chống so chéo loại tiền P0-2 | Gói trộn VND/USD có dấu "rẻ nhất" riêng từng loại tiền |
| Bộ kiểm tra máy | `npm test` **20/20** · `npx tsc --noEmit` **0 lỗi** |
| Giới hạn số lần gọi tính theo từng IP | `trust proxy` đã đặt + nginx có `X-Forwarded-For` ⇒ 12 máy không chặn lẫn nhau |

Lỗi TypeScript có sẵn ở `kiem-tra-ton-kho/page.tsx:463` **đã được sửa** — xoá khỏi danh sách nợ.

---

## Bốn vùng chưa từng chạy với dữ liệu thật

Các bảng này **rỗng hoàn toàn**, nên màn hình tương ứng chưa bao giờ được dùng thật. Đây là nơi
12 người kiểm nhiều khả năng gặp lỗi nhất — không phải vì có lỗi đã biết, mà vì chưa ai đi qua.

| Bảng | Số bản ghi | Màn hình liên quan |
| --- | --- | --- |
| `PurchaseOrder` | 0 | `/duyet` (tạo đơn hàng), `/hop-dong` |
| `GoodsReceivedNote` | 0 | `/warehouse` |
| `Inventory` | 0 | `/inventory`, `/kiem-tra-ton-kho` |
| `PrDetailFabAllocation` | 0 | `/phan-bo-che-tao` |
