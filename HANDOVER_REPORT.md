# 🏆 IRONCLAD MATRIX - BÁO CÁO NGHIỆM THU & BÀN GIAO (MVP)
> **Dự án:** Trạm Điều khiển Vật Tư - IBS Heavy Industry  
> **Trạng thái:** Hoàn tất Phase 1, Phase 2, Phase 3 (Go-live Ready)  
> **Ngày bàn giao:** 06/04/2026  

---

## 🏗️ 1. TỔNG QUAN KIẾN TRÚC MỚI
Hệ thống đã loại bỏ hoàn toàn các điểm nghẽn, rò rỉ bộ nhớ, và chế độ giả lập (Mock) để vận hành 100% bằng Logic dữ liệu thực thông qua kết nối ORM Prisma.

*   **Frontend (Port 3000):** Next.js 16+, Component-based architecture (Phân rã Sidebar, Table, Upload Board).
*   **Backend (Port 5005):** Node.js Express.
    *   Sử dụng **Middleware JWT** bọc toàn bộ các Endpoints thao tác PR/PO.
    *   Hỗ trợ Upload Local Storage bảo mật, không văng URL Public.
*   **Database (SQLite):** Bảng dữ liệu chuẩn ACID tích hợp transaction bảo vệ tính toàn vẹn (Gồm các block: Auth, Project/Budget, Bidding, Logistics, Inventory).

---

## 🔒 2. CHI TIẾT CÁC TÍNH NĂNG "LÕI" ĐÃ TRIỂN KHAI 

### Phase 1: Nền tảng & An ninh (Foundation)
*   [✓] **Khắc phục rò rỉ Connection Pool:** Setup Prisma Singleton Pattern tại `backend/src/lib/prisma.js`, ngăn sập luồng khi Query lớn.
*   [✓] **Bảo mật Đăng nhập (JWT + BCrypt):**
    *   Hệ thống chuyển sang tự động xác thực bằng form Account nội bộ chuẩn DOANH NGHIỆP.
    *   Lưu lịch sử Audit (IP, Truy cập).
*   [✓] **Tách biệt Môi trường (.env):** Chuyển mọi request mạng về `.env.development` `NEXT_PUBLIC_API_URL` linh hoạt phục vụ việc trỏ IP máy chủ khi mang vào mạng LAN nhà xưởng.

### Phase 2: Số hóa Quy trình Cốt lõi (Core Procurement Flow)
*   [✓] **P2.1 Quản lý Ngân Sách Dự Toán:** Bổ sung cơ chế đổ Data Chuẩn (BOM Master Data) cho mỗi mã Ngân Sách giúp máy nhận dạng cực chuẩn.
*   [✓] **P2.2 Gate 1 (Volume Enforcement):** Áp dụng logic đối chiếu 3 bước (Quét mã vật tư từ tệp CSV tải lên -> Kiểm tra Tồn Kho -> So sánh Giới Hạn Limit trong Ngân sách Dự án). Nếu Kỹ thuật nhập số lượng LỚN HƠN dự toán phê duyệt -> TỪ CHỐI TỨC THỜI.
*   [✓] **P2.3 Gate 3 (Inventory Hard Pegging):** Bọc chốt chặn Cấp Phát vào `prisma.$transaction`. Khi PO chuyển thành công sang Kho, Inventory sẽ bị Lock và cộng số `Allocated_Qty`, khoá chặt không cho phép điều động đi bất minh.

### Phase 3: Bế giảng Kịch bản Demo
*   [✓] **P3.1 Tính toán Lạm Phát Thực:** Thuật toán duyệt qua từng File PR, bóc tách giá thầu (Vendor Quoted) so sánh với `unitPriceEst` (Master Data) để tính chính xác tỷ lệ lạm phát thực chiến.
*   [✓] **P3.2 Kho lưu trữ Nội Bộ (FS Upload):** Các chứng thư (VD: CO/CQ thép ống) không còn dùng Cloud AWS ảo nữa. Giờ chúng được nạp vật lý vào `/uploads/certificates/` theo từng PO để KCS dễ truy vết.
*   [✓] **P3.3 PR Board Filtering:** Cơ chế tự che dữ liệu (Data RLS) dựa trên chức danh (Account Kỹ Thuật nhìn thấy list khác Account Mua Hàng).

---

## 🛠️ 3. SỔ TAY VẬN HÀNH DÀNH CHO IT NỘI BỘ

Để bảo trì và cấu hình Server tại phân xưởng từ nay về sau:
1.  **Duy trì Cơ sở dữ liệu:** Sơ đồ Data nằm trọn vẹn tại `frontend/prisma/schema.prisma`. Khi muốn thêm bớt cột tính năng, chỉ cần sửa file đó và chạy `npx prisma db push --accept-data-loss`.
2.  **Định tuyến Tên miền Nhà Xưởng (LAN IP):** Để các máy trạm phòng ban truy cập chung, IT mở file `frontend/.env.development` -> Cài `NEXT_PUBLIC_API_URL` bằng IP Máy chủ cài hệ thống (vd: `http://192.168.1.100:5005`). Khởi động lại Frontend.
3.  **Tái kích hoạt luồng Server (Nếu cúp điện/đứt mạng):** 
    *   Bật Bash 1 (Backend): Chạy lệnh `npm run dev` (Khuyên dùng `pm2 start src/app.js --name "ibshi_bo"` lúc Go-Live Prod).
    *   Bật Bash 2 (Frontend): Chạy lệnh `npm run dev`.

---
🌟 **KẾT LUẬN:** Gói phần mềm IBSHI Procurement "Ironclad Matrix" (MVP) **đã thoả mãn đầy đủ độ trưởng thành và sẵn sàng đóng gói Source Code**. Tất cả Flow và Data đã được bọc khóa chuẩn mực!
