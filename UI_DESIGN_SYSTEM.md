# UI_DESIGN_SYSTEM.md — Quy ước giao diện nền tảng Vật tư

> **Cập nhật 14/08/2026.** Tài liệu này **mô tả cách dùng**, không chứa con số.
> Mọi giá trị nằm ở một nơi duy nhất: khối `@theme` trong
> [`frontend/src/app/globals.css`](frontend/src/app/globals.css).
>
> Lý do: bản trước ghi số vào cả hai chỗ, ba tháng sau hai chỗ lệch nhau.
> Muốn biết đúng một giá trị là bao nhiêu thì mở `globals.css`, đừng tin tài liệu.

---

## 1. Hiện trạng — đọc trước khi sửa bất cứ gì

Bộ token đã đầy đủ từ 25/05, nhưng **gần như không được dùng**. Đo ngày 14/08:

| | Số lượng |
|---|---|
| Nơi dùng đúng lớp chuẩn (`.text-h1`, `.label`, `.badge-*`…) | **58** |
| Nơi viết cỡ chữ tay kiểu `text-[9px]` | **786** |
| Nơi viết mã màu tay kiểu `#1B365D` | **512** |

Vậy việc cần làm **không phải soạn quy ước mới** — mà là kéo 1.298 chỗ kia về chuẩn.
Thêm một bộ quy ước thứ hai chỉ làm tình hình tệ hơn.

**Một xung đột chưa xử lý:** đầu `globals.css` còn khoảng 48 token màu kiểu Material 3
(`--color-surface-container-lowest`, `--color-on-tertiary-fixed-variant`…) tồn tại song song
với 5 màu ngữ nghĩa. Hai hệ màu trong một tệp. Chưa gỡ vì cần rà xem chỗ nào còn dùng —
ghi vào backlog, không tự ý xoá.

---

## 2. Bảy nhóm token

Mở `globals.css` để xem giá trị. Dưới đây là **khi nào dùng cái nào**.

| Nhóm | Tiền tố | Dùng khi |
|---|---|---|
| **Chữ** | `--text-*` | 7 mức: chú thích → thân → nhấn → tiêu đề thẻ → tiêu đề mục → tiêu đề trang → số liệu lớn |
| **Màu ngữ nghĩa** | `--color-{brand,info,success,warning,danger}` | Mỗi màu có 3 biến thể: nền đậm, chữ trên nền đậm (`-fg`), nền nhạt (`-soft`) |
| **Khoảng cách** | `--space-*` | Thang 4px. Mọi `padding`, `gap`, `margin` |
| **Bo góc** | `--radius-*` | Nhỏ cho nhãn, vừa cho nút, lớn cho thẻ, tròn cho huy hiệu |
| **Đổ bóng** | `--shadow-*` | Nhẹ cho thẻ tĩnh, vừa khi rê chuột, đậm cho hộp thoại |
| **Bố cục** | `--sidebar-w`, `--topbar-h`, `--nav-item-h`, `--content-max` | Khung trang |
| **Ô điều khiển** | `--control-{sm,md,lg}`, `--row-h*`, `--cell-*`, `--icon-*`, `--bar-*` | Nút, ô nhập, dòng bảng, biểu tượng, thanh tiến độ |

### Quy tắc chọn màu

Màu **mang nghĩa**, không mang thẩm mỹ. Chọn theo trạng thái nghiệp vụ:

- `brand` — thương hiệu, nút chính, mục menu đang mở
- `info` — liên kết, trạng thái trung tính, đang chọn
- `success` — đã xong, đã duyệt, đã thanh toán
- `warning` — chờ xử lý, nháp, đang chạy
- `danger` — quá hạn, từ chối, huỷ, lỗi

Bốn thẻ số liệu bốn màu khác nhau **là sai** — màu khác nhau phải vì nghĩa khác nhau.

---

## 3. Cách viết đúng

```tsx
// ❌ SAI — số viết tay, không ai sửa hàng loạt được
<div className="text-[9px] font-black uppercase tracking-widest text-slate-400">NHÓM</div>
<div style={{ color: '#1B365D' }}>Tổng</div>
<span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">Đã duyệt</span>

// ✅ ĐÚNG — dùng lớp và biến
<div className="label">NHÓM</div>
<div className="text-h2">Tổng</div>
<span className="badge badge-success">Đã duyệt</span>
```

Cần giá trị lẻ không có lớp sẵn thì dùng biến, đừng viết số:

```tsx
<div style={{ height: 'var(--row-h)', paddingInline: 'var(--cell-px)' }} />
```

**Ngưỡng cỡ chữ:** không dùng nhỏ hơn `--text-min` (12px). Giao diện hiện còn nhiều chỗ
9–11px — đó là nợ phải trả dần, không phải chuẩn để bắt chước.

---

## 4. Kế hoạch kéo về chuẩn

Không sửa một lượt. **Mỗi trang một đợt, mỗi đợt một commit**, xong đợt nào kiểm đợt đó.
Số đo ngày 14/08, xếp theo mức nặng:

| Thứ tự | Trang | Cỡ chữ tay | Mã màu tay | Tổng |
|---|---|---|---|---|
| 1 | `/mua-hang` | 69 | 68 | **137** |
| 2 | `/duyet` | 91 | 37 | **128** |
| 3 | `/vendors` | 45 | 32 | 77 |
| 4 | `/warehouse` | 46 | 20 | 66 |
| 5 | `/thanh-toan` | 38 | 20 | 58 |
| 6 | `/dashboard` | 20 | 29 | 49 |
| 7 | `/inventory` | 21 | 17 | 38 |
| 8 | `/hop-dong` | 26 | 10 | 36 |
| 9 | `/projects` | 20 | 14 | 34 |
| 10 | `/lam-ro-ky-thuat` | 23 | 8 | 31 |
| 11 | `/kiem-tra-ton-kho` | 18 | 7 | 25 |
| 12 | `/lich-su-mua-hang` | 9 | 16 | 25 |
| 13 | `/settings` | 9 | 8 | 17 |
| 14 | `/login` | 0 | 12 | 12 |
| 15 | `/bao-gia` | 10 | 1 | 11 |
| 16 | `/alerts` | 1 | 0 | 1 |
| — | `TopNav.tsx` | 13 | 12 | 25 |
| — | `Sidebar.tsx` | 4 | 3 | 7 |

**Trang mẫu đề nghị: `/dashboard`** (49 chỗ). Không phải trang nặng nhất, nhưng nó có đủ
mọi thành phần — thẻ số liệu, biểu đồ cột, bảng, huy hiệu — nên làm xong là có mẫu cho
tất cả trang còn lại. Nặng nhất (`/mua-hang`, `/duyet`) để sau, khi mẫu đã ổn định.

**Ràng buộc mỗi đợt:** chỉ đổi hình thức, không đổi hành vi · chụp màn hình trước và sau ·
`npm test` 20/20 · `tsc` không lỗi mới · mở Chrome xem thật.

---

## 5. Logo

Năm tệp trong `LOGO/`. Chỉ **`Logo IBS-02.png`** dùng được trên nền sáng:
nền trong suốt, ba cột đỏ, chữ HEAVY INDUSTRY màu tối.

| Tệp | Nền | Dùng được ở thanh dọc? |
|---|---|---|
| `IBS-02` | trong suốt, chữ tối | ✅ **chọn tệp này** |
| `IBS-03` | khối đỏ đặc, vuông | ❌ |
| `IBS-04` | khối tối đặc, vuông | ❌ |
| `IBS-05` | khối đỏ đặc, ngang | ❌ |
| `IBS-06` | khối tối đặc, ngang | ❌ |

⚠️ Chỗ chữ `WORKSPACE / Tất cả dự án` ở đầu thanh dọc **là bộ chọn dự án có menu thả xuống**,
không phải nhãn trang trí. Thay hẳn bằng logo sẽ mất chức năng chuyển dự án.
