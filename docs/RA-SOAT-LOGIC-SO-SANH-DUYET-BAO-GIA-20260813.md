# RÀ SOÁT LOGIC SO SÁNH GIÁ THEO TỪNG MỤC VẬT TƯ → PHÊ DUYỆT

**Ngày:** 13/08/2026 · **Phiên:** CPVT · **Phạm vi:** nhánh báo giá – duyệt – tạo đơn hàng
**Trạng thái:** rà soát xong, CHƯA sửa code — chờ anh Hưng duyệt danh sách vá.

Viết tắt dùng lần đầu: **PR** = đề nghị mua hàng · **PO** = đơn đặt hàng · **BID** = gói chào giá ·
**NCC** = nhà cung cấp · **VAT** = thuế giá trị gia tăng · **UI** = giao diện người dùng.

---

## 0. TÓM TẮT CHO NGƯỜI QUYẾT

Hệ thống **có** đủ hạ tầng để so sánh giá nhiều NCC trên cùng một mục vật tư — mô hình dữ liệu
đúng, ma trận so sánh có, chọn NCC theo từng dòng có, tạo PO gộp theo NCC có. Nhưng đường đi từ
"so sánh" sang "phê duyệt" **đang gãy ở 3 chỗ có thể dẫn tới quyết định sai**:

1. Hai tab của cùng một trang ghép giá NCC bằng **hai quy tắc khác nhau** → cùng một mục vật tư
   có thể hiện hai con số khác nhau ở hai tab. Hiện có **22 ô giá đang hiển thị nhầm NCC** trên
   3 gói thầu thật, và **57 gói khác đang mang sẵn lỗi này**, sẽ bung ra ngay khi nhập báo giá.
2. Có **hai đường phê duyệt song song không nối với nhau**. Bấm "Chọn NCC này" ở tab So sánh
   không tạo được PO; chọn từng dòng ở tab Duyệt thì không cập nhật trạng thái gói.
3. Việc **duyệt không để lại dấu vết**: 508 mục đã được duyệt NCC nhưng nhật ký kiểm toán có
   **0 bản ghi** nào về hành vi duyệt — không biết ai duyệt, lúc nào, đổi từ NCC nào sang NCC nào.

Ngoài ra 3/5 chế độ chọn thầu là **logic chết** — backend viết xong, gắn route xong, nhưng giao
diện không bao giờ gọi tới.

---

## 1. SỐ LIỆU NỀN (tự truy vấn lại 13/08/2026, không chép từ prompt)

| Chỉ tiêu | Số |
|---|---|
| Gói thầu (BidAnalysis) | 251 |
| Gói có ≥2 NCC báo giá | 132 |
| Mục vật tư (BidQuoteItem) | 2.188 |
| Báo giá dòng (BidQuoteOffer) | 1.559 |
| Mục có ≥2 NCC cùng báo giá | 378 |
| Mục chỉ 1 NCC báo giá | 485 |
| Mục không có báo giá nào | 1.325 (61%) |
| Báo giá đơn giá = 0 | 286 |
| Mục đã duyệt NCC | 508 |
| Bản ghi BidGroupSelection | 0 |
| Bản ghi BidVendorScore | 0 |
| Nhật ký kiểm toán về hành vi duyệt | **0** |

---

## 2. LUỒNG ĐANG CHẠY THẬT (B3)

```
/bao-gia  ── tab "Yêu cầu" / "Đã nhận BG"
    │
    ▼
/duyet?tab=compare   ── ma trận mục × NCC (chỉ đọc)
    │                   nút "Chọn NCC này"  → PATCH /bid-analyses/:id/select-vendor
    │                                          ⇒ đặt isWinner ở cấp GÓI + status=SELECTED
    │                                            + approvedBy + approvedAt
    ▼
/duyet?tab=approve   ── dropdown "NCC duyệt" từng dòng
    │                   → PATCH /bid-analyses/:bidId/items/:itemId/select-vendor
    │                     ⇒ đặt BidQuoteItem.selectedVendorName  (KHÔNG ghi nhật ký, KHÔNG đổi status gói)
    │                   → GET  /bid-analyses/:id/approval-summary  (gộp theo selectedVendorName)
    ▼
POST /bid-analyses/:id/create-po
      ⇒ gộp theo selectedVendorName → mỗi NCC 1 PO + các dòng ContractDetail
        + status gói = CONTRACTED + ghi nhật ký CREATE_PO_FROM_BID
```

**Điểm gãy:** `create-po` chỉ đọc `selectedVendorName` (cấp dòng). Đường "Chọn NCC này" ở tab
So sánh chỉ ghi `isWinner` (cấp gói) → người dùng bấm nút đó xong, sang tạo PO sẽ bị chặn với
thông báo *"Chưa có item nào được duyệt NCC"* dù màn hình vừa báo đã chọn NCC thành công.
Bằng chứng: [bidAnalysisController.js:1499](../backend/src/controllers/bidAnalysisController.js#L1499)
so với [bidAnalysisController.js:295](../backend/src/controllers/bidAnalysisController.js#L295).

---

## 3. BẢNG 5 CHẾ ĐỘ CHỌN THẦU (B4)

| Chế độ | API backend | Đã gắn route | Giao diện có gọi | Dữ liệu thực tế | Kết luận |
|---|---|---|---|---|---|
| PER_ITEM | dùng `items/:itemId/select-vendor` | ✅ | ✅ dropdown từng dòng | 508 mục đã duyệt | **Chạy thật** |
| PER_BID | `PATCH /select-vendor` | ✅ | ✅ nút ở tab So sánh | 68 NCC gắn cờ thắng | **Chạy nhưng không nối được sang PO** |
| PER_GROUP | `POST/GET /group-selection(s)` | ✅ dòng 195–196 | ❌ **0 lần** | 0 bản ghi | **Logic chết** |
| AUTO_MIN_PRICE | `POST /auto-select-min-price` | ✅ dòng 197 | ❌ **0 lần** | — | **Logic chết** |
| MANUAL_WEIGHTED | `POST/GET /vendor-scores` | ✅ dòng 198–199 | ❌ **0 lần** | 0 bản ghi | **Logic chết** |

Ô chọn chế độ (`SelectionModeChooser`) **có** gọi `PATCH /selection-mode` để lưu chế độ và reset
lựa chọn cũ — nhưng sau khi lưu, giao diện phía dưới **vẫn luôn là bảng PER_ITEM**, bất kể chọn
chế độ nào. Người dùng đổi sang AUTO_MIN_PRICE sẽ bị reset hết lựa chọn cũ mà không nhận lại
được chức năng gì.

---

## 4. CHẤT LƯỢNG PHÉP SO SÁNH GIÁ (B5 — 8 câu)

### 4.1 Ma trận có gom đúng NCC cho từng mục không? → **KHÔNG, có lỗi thật**

Tab **So sánh** ghép theo thứ tự NCC:
[duyet/page.tsx:439](../frontend/src/app/duyet/page.tsx#L439)
```js
const offer = it.offers.find((o) => o.vendor?.vendorOrder === v.vendorOrder);
```
Tab **Duyệt** ghép theo tên NCC:
[duyet/page.tsx:582](../frontend/src/app/duyet/page.tsx#L582)
```js
const offer = it.offers.find((o) => o.vendor?.vendorName === v.vendorName);
```

`vendorOrder` **không duy nhất** trong một gói: có **60 gói** tồn tại hai NCC trùng số thứ tự.
`find` trả về bản ghi đầu tiên khớp → cột NCC thứ hai hiển thị giá của NCC thứ nhất.

Ví dụ thật, gói `BID-VPI095-2605-VTC-003`, mục `C100X50X5X7.5-12000L`:

| Cột hiển thị | Giá hiện ra | Thực tế là giá của |
|---|---|---|
| Hùng Nguyên (order 0) | 17.500 | Hùng Nguyên ✅ |
| NGỌC HIẾU/APEC (order 1) | 17.090,91 | NGỌC HIẾU/APEC ✅ |
| NGỌC HIẾU (order 1) | 17.090,91 | ⚠️ **NGỌC HIẾU/APEC** |
| APEC (order 2) | 17.090,91 | APEC ✅ |

**Phạm vi hiện tại:** 22 ô giá sai trên 3 gói — `BID-VPI095-2605-VTC-003` (9 ô),
`BID-WNC097-2604-VTC-002` (9 ô), `BID-VPI095-2604-VTC-001` (4 ô).
**Phạm vi tiềm ẩn:** 57 gói nữa cũng trùng `vendorOrder` nhưng chưa có báo giá nào nên chưa lộ.
Nhập báo giá vào là sai ngay.

Hệ quả kép: cùng một mục, tab So sánh và tab Duyệt có thể hiện **hai con số khác nhau** — người
duyệt so ở tab này rồi bấm duyệt ở tab kia.

### 4.2 Có quy về cùng đơn vị tính không? → **Không cần, nhưng không có chốt chặn**

`BidQuoteOffer` không có trường đơn vị riêng; mọi báo giá của một mục đều dùng `uom` của mục đó
([schema.prisma, model BidQuoteOffer](../backend/prisma/schema.prisma)). Nên các NCC luôn được so
trên cùng đơn vị **theo thiết kế**. Rủi ro còn lại: nếu một NCC báo theo đơn vị khác (báo theo
cây trong khi mục tính theo kg), hệ thống không có chỗ nào ghi nhận và không cảnh báo — con số
vẫn được đem so bình thường.

### 4.3 Có xử lý khác loại tiền không? → **KHÔNG. Đây là lỗi nặng**

`currency` nằm ở cấp NCC (`BidQuoteVendor.currency`): 413 NCC báo VND, 37 NCC báo USD, và
**11 gói trộn cả hai loại tiền**. Nhưng:

- Ô đơn giá trong ma trận in bằng `fmtNum(offer.unitPrice, 0)` — **không hiện ký hiệu tiền tệ**
  ([duyet/page.tsx:444](../frontend/src/app/duyet/page.tsx#L444)).
- Phép tìm giá thấp nhất so số thô, không quy đổi
  ([duyet/page.tsx:424](../frontend/src/app/duyet/page.tsx#L424) và
  [duyet/page.tsx:562](../frontend/src/app/duyet/page.tsx#L562)).

Trong gói trộn tiền, NCC báo USD **luôn được tô vàng là "giá thấp nhất"** vì con số nhỏ hơn
khoảng 25.000 lần. Người duyệt nhìn vào sẽ chọn nhầm.

### 4.4 So trước hay sau VAT? → **Không xác định được — hệ thống không có trường VAT ở tầng báo giá**

`BidAnalysis`, `BidQuoteVendor`, `BidQuoteOffer` đều **không có** trường VAT nào. Trong khi
`ContractDetail` (tầng hợp đồng) lại có `vatRate` mặc định 10%. Nghĩa là khi `create-po` sinh
dòng hợp đồng từ báo giá, hệ thống **mặc định gán VAT 10%** cho một con số mà không ai biết đã
gồm VAT hay chưa. Nếu NCC A báo giá đã gồm VAT còn NCC B báo chưa gồm, hệ thống đang so lệch 10%.

### 4.5 286 báo giá đơn giá = 0 được xử lý ra sao? → **Đúng ở màn hình so sánh, SAI ở khâu tạo PO**

Màn hình loại giá 0 ra khỏi phép tìm giá thấp nhất (`filter((o) => o.unitPrice > 0)`) — đúng.

Nhưng ở khâu tạo PO ([bidAnalysisController.js:1553](../backend/src/controllers/bidAnalysisController.js#L1553)):
```js
const unitPrice = offer?.unitPrice || it.estimateUnitPrice || 0;
const total     = offer?.totalPrice || unitPrice * qty;
```
Toán tử `||` coi `0` là "rỗng" → khi NCC báo giá 0, hệ thống **âm thầm lấy đơn giá dự toán thay
vào** và ghi lên đơn hàng như thể đó là giá NCC báo. Không có cờ, không có cảnh báo. Đây là đường
dẫn tới sai tiền trên chứng từ thật.

### 4.6 1.325 mục không có báo giá hiển thị ra sao? → **Vẫn hiện, thành dòng trống toàn dấu "—"**

Ma trận duyệt qua `bidDetail.items` không lọc. Mục không có báo giá nào vẫn chiếm một dòng đầy
đủ với tất cả các ô là "—". Với tỉ lệ 61%, người duyệt phải cuộn qua rất nhiều dòng rỗng để tìm
dòng có số. Không có bộ lọc "chỉ hiện mục có ≥2 báo giá".

### 4.7 Điều kiện giao hàng / thanh toán có được đưa vào so sánh không? → **KHÔNG**

`BidQuoteOffer` **có** hai trường `deliveryTerm` (tiến độ giao hàng) và `remarks`, nhưng trong
702 dòng của trang `/duyet` **không có lần nào** hai trường này được hiển thị. Người duyệt chỉ
nhìn thấy con số, không thấy NCC rẻ hơn đó giao chậm hơn bao nhiêu ngày.

### 4.8 Có chỉ ra chênh lệch so với NCC rẻ nhất không? → **KHÔNG**

Chỉ có tô nền vàng cho ô rẻ nhất. Không có cột chênh lệch tiền, không có %. Người duyệt muốn biết
"chọn NCC này đắt hơn bao nhiêu" phải tự nhẩm.

---

## 5. KHÂU PHÊ DUYỆT (B6 — 4 câu)

### 5.1 Có ghi nhật ký ai duyệt, lúc nào không? → **KHÔNG (nghiêm trọng)**

`selectItemVendor` chỉ chạy đúng một lệnh cập nhật, không ghi `AuditLog`
([bidAnalysisController.js:335](../backend/src/controllers/bidAnalysisController.js#L335)).
Model `BidQuoteItem` cũng **không có** trường `selectedAt` / `selectedBy`.

Đối chiếu thực tế: **508 mục đã được duyệt NCC**, nhật ký kiểm toán có **0 bản ghi** liên quan
(chỉ có LOGIN 120, CREATE_BID_FROM_PR 2, CREATE_PO_FROM_BID 1…). Không thể trả lời được câu
"ai đã chọn NCC này cho mục này, ngày nào, trước đó là NCC nào".

Đường cấp gói (`selectVendor`) có ghi `approvedBy` + `approvedAt` lên bản ghi gói, nhưng cũng
không ghi `AuditLog`, và chỉ 6/251 gói có `approvedAt`.

⚠️ Lệch số đáng ngờ: **187 gói mang trạng thái SELECTED** nhưng chỉ 6 gói có `approvedAt`.
Nguyên nhân: trạng thái này được gán tự động lúc nhập dữ liệu
([bidAnalysisController.js:117](../backend/src/controllers/bidAnalysisController.js#L117)) chứ
không phải do ai đó phê duyệt. **Không được dùng trạng thái SELECTED để suy ra "đã duyệt".**

### 5.2 Duyệt hai lần có bị nhân đôi không? → **Không** (an toàn)

`selectItemVendor` là phép gán giá trị, chạy lại cho kết quả như nhau.

### 5.3 Sau khi duyệt có khoá lại không? → **KHÔNG**

`selectItemVendor` không kiểm tra trạng thái gói. Gói đã `CONTRACTED` (đã sinh PO) vẫn đổi được
NCC duyệt của từng dòng, và PO đã sinh **không đổi theo**. Kết quả là chứng từ và dữ liệu duyệt
lệch nhau mà không ai biết.

### 5.4 Tạo PO gộp theo lựa chọn từng dòng hay theo cờ thắng cấp gói? → **Theo từng dòng — đúng**

`create-po` gộp theo `selectedVendorName` của từng dòng
([bidAnalysisController.js:1512](../backend/src/controllers/bidAnalysisController.js#L1512)),
đúng với mạch nghiệp vụ "mỗi mục một NCC". Đây là phần làm đúng.

Hai vấn đề còn lại ở hàm này:
- **Không chặn tạo trùng:** không kiểm tra gói đã `CONTRACTED` chưa. Bấm hai lần sẽ sinh hai bộ
  PO (mã PO tự tăng nên không vướng ràng buộc trùng khoá).
- **Suy loại hợp đồng từ loại tiền:** `contractType = currency === 'VND' ? 'DOMESTIC' : 'IMPORT'`
  ([bidAnalysisController.js:1560](../backend/src/controllers/bidAnalysisController.js#L1560)).
  NCC trong nước báo giá USD sẽ bị xếp nhầm thành hàng nhập khẩu.

---

## 6. DANH SÁCH VÁ ĐỀ XUẤT

### 🔴 P0 — sai có thể dẫn tới chọn nhầm NCC hoặc sai tiền

| # | Việc | File sẽ sửa | Rủi ro khi sửa | Đường lùi |
|---|---|---|---|---|
| P0-1 | Ghép báo giá vào cột NCC theo `vendorId` thay vì `vendorOrder`/`vendorName`; thống nhất cả hai tab dùng một hàm chung | `frontend/src/app/duyet/page.tsx` (dòng 439, 582) | Thấp — chỉ đổi khoá ghép, cần API trả `offer.vendorId` | `git checkout` 1 file |
| P0-2 | Chặn so sánh chéo loại tiền: hiện ký hiệu tiền ở mọi ô giá; chỉ tìm giá thấp nhất trong cùng loại tiền; gói trộn tiền thì hiện cảnh báo | `duyet/page.tsx`, `lib/format.ts` | Thấp | `git checkout` 2 file |
| P0-3 | Bỏ `||` khi lấy giá tạo PO — dùng kiểm tra `!= null` và **từ chối** dòng có đơn giá 0 kèm thông báo rõ, thay vì âm thầm thay bằng dự toán | `backend/src/controllers/bidAnalysisController.js:1553` | Trung bình — có thể chặn vài PO đang tạo được | `git checkout` 1 file |
| P0-4 | Ghi nhật ký mọi hành vi duyệt: thêm `AuditLog` trong `selectItemVendor` + `selectVendor` (ghi rõ NCC cũ → NCC mới) | `bidAnalysisController.js:308–345`, `:273–305` | Thấp — chỉ thêm ghi log | `git checkout` 1 file |

### 🟠 P1 — sai lệch quy trình, chưa mất tiền ngay

| # | Việc | File | Rủi ro | Đường lùi |
|---|---|---|---|---|
| P1-1 | Nối hai đường phê duyệt: bấm "Chọn NCC này" ở tab So sánh thì đồng thời gán NCC đó cho toàn bộ dòng chưa duyệt (đúng nghĩa chế độ PER_BID) | `bidAnalysisController.js` + `duyet/page.tsx` | Trung bình — đổi hành vi nút hiện có, cần hỏi ý anh Hưng trước | `git checkout` 2 file |
| P1-2 | Khoá sửa lựa chọn khi gói đã `CONTRACTED`; muốn sửa phải huỷ PO trước | `bidAnalysisController.js:308` | Thấp | `git checkout` |
| P1-3 | Chặn tạo PO lần hai trên gói đã `CONTRACTED` | `bidAnalysisController.js:1483` | Thấp | `git checkout` |
| P1-4 | Thêm `selectedAt` + `selectedBy` vào `BidQuoteItem` | `prisma/schema.prisma` + migration | **Cần duyệt riêng** — đụng schema, DB đang có 2.188 mục | `ALTER TABLE … DROP COLUMN` (cột cho phép rỗng) |
| P1-5 | Dọn `vendorOrder` trùng: đánh số lại theo gói, thêm ràng buộc duy nhất `@@unique([bidId, vendorOrder])` | schema + script vá dữ liệu | **Cần duyệt riêng** — 60 gói phải đánh số lại | Sao lưu bảng trước, khôi phục từ bản sao |

### 🟡 P2 — trải nghiệm và nợ kỹ thuật

| # | Việc | File |
|---|---|---|
| P2-1 | Thêm cột chênh lệch so với giá thấp nhất (tiền + %) | `duyet/page.tsx` |
| P2-2 | Hiện `deliveryTerm` + `remarks` trong ô báo giá (dạng chú giải khi rê chuột hoặc dòng phụ) | `duyet/page.tsx` |
| P2-3 | Bộ lọc "chỉ hiện mục có ≥2 báo giá" để giấu 61% dòng rỗng | `duyet/page.tsx` |
| P2-4 | Quyết định dứt điểm 3 chế độ chết: làm giao diện cho PER_GROUP / AUTO_MIN_PRICE / MANUAL_WEIGHTED, **hoặc** ẩn khỏi ô chọn và ghi vào backlog | `bid-status.ts`, `SelectionModeChooser.tsx` |
| P2-5 | Bỏ suy loại hợp đồng từ loại tiền — lấy theo `vendorType` của NCC | `bidAnalysisController.js:1560` |
| P2-6 | Thay đoán nhóm vật tư bằng cắt chuỗi tên (`uniqueGroups`, dòng 516–522) bằng `materialSubGroupCode` thật từ API | `duyet/page.tsx` |
| P2-7 | Sửa cảnh báo React: `<>` trong `map` thiếu `key` (dòng 411–417, 442–447) | `duyet/page.tsx` |

---

## 7. NGHIỆM THU PHIÊN NÀY

- [x] Trả lời đủ 8 câu mục 4 + 4 câu mục 5, mỗi kết luận có `file:dòng`.
- [x] Bảng 5 chế độ đầy đủ, không ô trống.
- [x] 3 API mồ côi đều có khuyến nghị (P2-4: làm giao diện hoặc ẩn đi).
- [x] Mỗi mục vá có mức ưu tiên · file · rủi ro · đường lùi.
- [x] `cd backend && npm test` → **20/20 xanh** (không sửa code sản phẩm trong phiên này).
- [x] Số liệu tự truy vấn lại từ DB, không chép từ prompt.

**Giới hạn của lần rà soát này — nói rõ để không hiểu nhầm:** mọi kết luận dựa trên đọc mã nguồn,
truy vấn cơ sở dữ liệu và gọi API thật; **chưa có xác nhận bằng mắt trên trình duyệt**. Ba ví dụ ở
mục 4.1 là mô phỏng lại đúng biểu thức của giao diện trên dữ liệu thật, không phải ảnh chụp màn hình.
Đề nghị anh Hưng mở `/duyet?bid=<id gói BID-VPI095-2605-VTC-003>&tab=compare` để đối chiếu mắt thường.

---

## 8. CẦN ANH HƯNG QUYẾT

1. **P0-3** — khi NCC báo đơn giá 0: từ chối tạo PO, hay vẫn cho tạo nhưng gắn cờ để soát sau?
2. **P1-1** — nút "Chọn NCC này" ở tab So sánh: cho nó gán NCC cho tất cả dòng chưa duyệt, hay bỏ
   hẳn nút đó để chỉ còn một đường duyệt duy nhất theo từng dòng?
3. **P1-4 + P1-5** — hai việc này đụng schema và dữ liệu 60 gói, cần anh duyệt riêng trước khi chạy.
4. **P2-4** — ba chế độ chọn thầu chết: đầu tư làm cho xong, hay ẩn đi để giao diện khỏi hứa suông?

---

*CPVT — 13/08/2026. Không `git push`. Không chạy migration. Không sửa code sản phẩm trong phiên này.*
