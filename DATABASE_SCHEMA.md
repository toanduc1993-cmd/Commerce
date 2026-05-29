# Thiết kế Dữ liệu: Cốt lõi Kiểm soát Chi phí & Khối lượng (Phòng Thương Mại)

Từ định hướng "Kiểm soát Chi phí / Khối lượng / Chủng loại là yếu tố sống còn", kiến trúc Database được thiết kế theo mô hình **Project-Based Inventory Management** (Quản lý Tồn kho theo Dự án). Vật tư nhập về kho chung (`Central Warehouse`) nhưng phải được "gắn mác ảo" (Hard Allocation / Pegging) cho từng dự án để khóa luồng chi phí.

## 1. Cơ chế Hoạt động (Workflow)

1. **Ba nguồn PR (Phòng Thiết kế, Dự án, Kho)** sẽ tạo Request. Hệ thống tự map với `Project_ID` và `Category_ID`.
2. Trọng tâm kiểm soát: Trước khi tạo PO, hệ thống check **Ngân sách/Định mức khối lượng** của Dự án.
   - `Cost Check`: Tổng tiền PO có vượt Budget của hạng mục không?
   - `Volume Check`: Số lượng mua có vượt định mức Thiết kế/Dự án đã duyệt không?
3. **Nhập Kho (GRN):** Đẩy vào kho chung nhưng ghi log tài chính vào `Project Ledger`.

## 2. Sơ đồ Dữ liệu (ERD - Database Schema)

```mermaid
erDiagram
    PROJECTS {
        uuid id PK
        string project_code
        string name
        decimal total_budget
    }
    
    MATERIAL_CATEGORIES {
        uuid id PK
        string code "Ví dụ: THEP, SON, HAN, TIEUHAO"
        string name
        uuid parent_id FK
    }

    MATERIALS {
        uuid id PK
        string material_code
        string name
        uuid category_id FK
        string unit "Kg, Lít, Cái"
    }

    PROJECT_BUDGETS {
        uuid id PK
        uuid project_id FK
        uuid category_id FK
        decimal limit_quantity "Khối lượng tối đa được mua"
        decimal limit_cost "Ngân sách tối đa"
        decimal used_quantity
        decimal used_cost
    }

    PURCHASE_REQUISITIONS {
        uuid id PK
        string pr_no
        uuid project_id FK "Null nếu là Kho yêu cầu vật tư tiêu hao"
        string source_dept "DESIGN, PROJECT, WAREHOUSE"
        string status "PENDING, APPROVED, PO_CREATED"
    }

    PR_DETAILS {
        uuid id PK
        uuid pr_id FK
        uuid material_id FK
        decimal requested_qty
        decimal estimated_price
    }

    PURCHASE_ORDERS {
        uuid id PK
        string po_no
        uuid vendor_id FK
        string status
    }

    PO_DETAILS {
        uuid id PK
        uuid po_id FK
        uuid pr_detail_id FK "Link thẳng về PR để check khối lượng"
        decimal ordered_qty
        decimal unit_price
        decimal total_amount
    }

    INVENTORY {
        uuid id PK
        uuid material_id FK
        decimal total_stock "Tồn kho thực tế ở kho chung"
    }

    PROJECT_ALLOCATIONS {
        uuid id PK
        uuid material_id FK
        uuid project_id FK
        decimal allocated_qty "Số lượng vật tư trong kho đang bị khóa (reserve) cho dự án này"
    }

    PROJECTS ||--o{ PROJECT_BUDGETS : "has"
    MATERIAL_CATEGORIES ||--o{ PROJECT_BUDGETS : "controls limit by"
    MATERIAL_CATEGORIES ||--o{ MATERIALS : "contains"
    
    PROJECTS ||--o{ PURCHASE_REQUISITIONS : "requests"
    PURCHASE_REQUISITIONS ||--o{ PR_DETAILS : "has lines"
    PR_DETAILS }o--|| MATERIALS : "item"
    
    BIDS {
        uuid id PK
        string bid_no
        uuid project_id FK
        string subject
        string status "PENDING, APPROVED, REJECTED"
        uuid selected_vendor_id FK
    }

    BID_DETAILS {
        uuid id PK
        uuid bid_id FK
        uuid pr_detail_id FK "Liên kết vật tư của PR"
        decimal pr_qty
    }

    QUOTATIONS {
        uuid id PK
        uuid bid_detail_id FK
        uuid vendor_id FK
        decimal unit_price
        decimal total_price
        boolean is_selected
        string note
    }

    PR_DETAILS ||--o{ BID_DETAILS : "analyzed in"
    BIDS ||--o{ BID_DETAILS : "contains"
    BID_DETAILS ||--o{ QUOTATIONS : "receives"
    
    BID_DETAILS ||--o{ PO_DETAILS : "fulfilled by"
    PURCHASE_ORDERS ||--o{ PO_DETAILS : "has lines"
    
    MATERIALS ||--o{ INVENTORY : "stocked in"
    MATERIALS ||--o{ PROJECT_ALLOCATIONS : "reserved for"
    PROJECTS ||--o{ PROJECT_ALLOCATIONS : "owns"
```

## 3. Điểm Chốt Cửa Phanh "Sống Còn" (Hard Controls)

1. **Gate 1 - Khi duyệt PR:** Trigger sẽ so sánh `PR_DETAILS.requested_qty` với `PROJECT_BUDGETS.limit_quantity - PROJECT_BUDGETS.used_quantity`. Tuýt còi ngay nếu vượt định mức.
2. **Gate 1.5 - Giải trình Mua sắm (Bid Analysis):** Trước khi tạo PO, hệ thống ánh xạ `PR_DETAILS` sang bảng `BIDS` để ghi nhận báo giá từ nhiều nhà cung cấp nhỏ (`QUOTATIONS`). Phải chọn Vendor chiến thắng.
3. **Gate 2 - Khi làm PO:** Buộc phải Map `PO_DETAILS` với `BID_DETAILS` hoặc `PR_DETAILS`. Giá PO nếu đội lên quá X% so với `estimated_price` thì phải luân chuyển qua Ma trận duyệt của Ban Giám Đốc.
4. **Gate 3 - Kho Chung nhưng Cost Riêng:** Khi kho nhập vật tư vào hệ thống (`INVENTORY`), số lượng này đồng thời cộng vào `PROJECT_ALLOCATIONS` dựa trên PR gốc. Vật tư này về lý thuyết nằm ở kho chung, nhưng đội sản xuất của Dự Án Khác tuyệt đối KHÔNG thể xuất kho dùng lố phần của dự án chủ sở hữu được.
