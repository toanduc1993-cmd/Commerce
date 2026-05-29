# TỔNG QUAN KIẾN TRÚC KỸ THUẬT & NGHIỆP VỤ (VẬT TƯ E-PROCUREMENT)

Tài liệu này xác định ranh giới hệ thống, luồng dữ liệu, cấu trúc luân chuyển và các cổng API Map chuẩn bị cho việc lập trình. Tất cả nghiệp vụ đều bám sát đặc thù đóng tàu/gia công (ETO) với đầu vào từ Excel.

---

## 1. KIẾN TRÚC TỔNG THỂ (SYSTEM ARCHITECTURE)

**Stack Công nghệ Khuyến nghị:**
- **Frontend / Client:** Next.js (React) kết hợp Tailwind CSS. Xây dựng Dashboard Quản trị + Vendor Portal (Nơi Cung cấp báo giá).
- **Backend / API:** Node.js (Express hoặc NestJS) - Cực kỳ phù hợp để xử lý luồng dữ liệu I/O từ Excel và JSON phức tạp của báo giá.
- **Database:** PostgreSQL. Dùng chuẩn Relational cho Transaction tài chính (ACID) và dùng type `JSONB` cho các thông số kỹ thuật (Specs) không cố định.
- **File Storage:** AWS S3 / MinIO (lưu file PR Excel, Báo giá PDF, Chứng chỉ CO/CQ/MTR).
- **AI Intelligence:** Gemini Vision AI Agent 
  - Nhiệm vụ phân tích Báo giá PDF từ Vendor không chuẩn hóa để map vào database.
  - OCR đọc bảng thành phần hoá học (Impact / CE) trong chứng chỉ MTR ở Phase 4.

**Sơ đồ Kiến trúc Cấu kiện:**
```mermaid
graph TD
    Client(Giao diện Mua Hàng & Kỹ Thuật) -- REST API / JWT --> Gateway(Cổng API Node.js)
    Vendor(Vendor Portal) -- REST API --> Gateway
    
    Gateway --> ModulePR[Module 1: PR & Budget Excel Ingestion]
    Gateway --> ModuleBid[Module 2: Bidding & Sourcing Engine]
    Gateway --> ModulePO[Module 3: PO & Inventory Allocation]
    
    Gateway --> Storage[(AWS S3 / File Storage)]
    Gateway --> DB[(PostgreSQL Database)]
    
    ModuleBid -.-> |Phân tích File PDF| AI[Gemini / AI Pipeline]
    ModulePO -.-> |OCR Chứng chỉ| AI
```

---

## 2. LUỒNG NGHIỆP VỤ CỐT LÕI (SWIMLANE WORKFLOW)

Sơ đồ giới hạn người dùng và rẽ nhánh của dòng chảy mua sắm.

```mermaid
sequenceDiagram
    participant Eng as Phòng Kỹ Thuật
    participant Sys as Hệ thống / API
    participant Pro as Phòng Mua Sắm
    participant Ven as Vendor (Nhà Cung cấp)
    participant BOD as Ban Giám Đốc

    %% Giai đoạn 1
    rect rgb(235, 243, 255)
    Note over Eng,Sys: PHASE 1: Nhập liệu Master Data & PR
    Eng->>Sys: Upload Excel [Dự Toán Gốc]
    Sys-->>Sys: Validate Cấu trúc -> Lưu PROJECT_BUDGETS
    Eng->>Sys: Upload Excel [Yêu Cầu PR]
    Sys->>Sys: Kiểm tra (Gate 1): Check Số lượng PR có ≤ Dự Toán?
    alt Vượt định mức
        Sys-->>Eng: Cảnh báo đỏ (Từ chối File/Báo lỗi dòng)
    else Hợp lệ
        Sys->>Pro: Sinh Phiếu PR hợp lệ chờ Xử lý
    end
    end

    %% Giai đoạn 2
    rect rgb(255, 245, 230)
    Note over Sys,Ven: PHASE 2: Báo giá & Giải trình (Bid Analysis)
    Pro->>Sys: Phát lệnh Yêu cầu Báo giá (RFQ)
    Sys->>Ven: Cảnh báo Tự động / Gửi mail truy cập Portal
    Ven->>Sys: Submit Cấu hình & Giá (JSON / PDF)
        Sys-->>Pro: Tự động Bắn cờ Status (Cần Làm Rõ)
        Pro->>Sys: Trình giải trình (Gate 1.5) - Chốt Vendor X
    Sys->>BOD: Gửi duyệt (Dựa trên ma trận tài chính)
    BOD-->>Sys: Approved
    end

    %% Giai đoạn 3
    rect rgb(230, 255, 235)
    Note over Sys,BOD: PHASE 3: PO & Tồn kho Dự án
    Sys->>Pro: Tự động phát hành PO từ Báo giá đã duyệt
    Ven->>Sys: Giao hàng + Kèm tệp Chứng chỉ (MTR / CO)
    Pro->>Sys: Đánh dấu Nhận Hàng (Receipt)
    Sys->>Sys: Gate 3: Cứng hóa Allocation (Pegging) vật tư vào Dự án gốc
    end
```

---

## 3. LƯỢC ĐỒ QUAN HỆ DỮ LIỆU CỐT LÕI (LOGIC DATA ERD)

```mermaid
erDiagram
    PROJECT ||--o{ PROJECT_BUDGET : "có"
    PROJECT ||--o{ PURCHASE_REQUISITION : "phát sinh"
    
    PROJECT {
        string prj_id PK
        string code "Ví dụ: 2024-FPSO-VN"
    }
    
    PROJECT_BUDGET {
        string pb_id PK
        string prj_id FK
        string item_code
        float limit_qty "Lấy từ Excel gốc"
    }

    PURCHASE_REQUISITION {
        string pr_id PK
        string prj_id FK
        string status "DRAFT, APPROVED, SOURCING"
        int revision_number "Số hiệu phiên bản"
    }

    PR_DETAILS {
        string prd_id PK
        string pr_id FK
        string item_code 
        float req_qty "Nhập từ Excel PR"
    }
    PURCHASE_REQUISITION ||--|{ PR_DETAILS : "chứa"

    BID_ANALYSIS {
        string ba_id PK
        string pr_id FK
        string selected_vendor_id FK
        string status "PENDING, BOD_APPROVED"
    }
    
    QUOTATIONS {
        string quote_id PK
        string ba_id FK
        string vendor_id FK
        float total_price
    }
    BID_ANALYSIS ||--|{ QUOTATIONS : "tập hợp báo giá"

    PURCHASE_ORDER {
        string po_id PK
        string ba_id FK "Xuất bản từ Bid đã duyệt"
    }
```

---

## 4. BẢNG MAPPING CỔNG GIAO TIẾP (API MAP)

| Phase | METHOD | Endpoints Kỹ Thuật (RESTful) | Ý nghĩa Logic & Input/Output |
| :--- | :---: | :--- | :--- |
| **P1** | `POST` | `/api/v1/projects/{id}/budgets/import` | (Upload Excel) - Trả về `200` mảng lỗi nếu sai UOM, sai cấu trúc cột. Ghi `PROJECT_BUDGETS`. |
| **P1** | `POST` | `/api/v1/prs/import` | (Upload Excel) - Trigger GATE 1. Quét PR items vs Budget. Trả về Validation Array (Đỏ/Xanh). |
| **P1** | `GET` | `/api/v1/prs/{id}` | Lấy chi tiết PR và các cờ trạng thái (vd: Cần Làm Rõ) trên dòng. |
| **P2** | `POST` | `/api/v1/rfq/generate` | Xả từ `PR_DETAILS` thành thư mời thầu. |
| **P2** | `POST` | `/api/v1/vendors/quotes/submit` | Vendor submit giá. Lọc dữ liệu thô (JSONB Specs). |
| **P2** | `GET` | `/api/v1/bids/{pr_id}/analysis-matrix` | Đổ dữ liệu tổng hợp ma trận so sánh 3-5 báo giá (Gate 1.5). |
| **P2** | `POST` | `/api/v1/bids/approve` | Cấp BOD submit quyết định phê duyệt Vendor X. |
| **P3** | `POST` | `/api/v1/pos/generate-from-bid` | Hệ thống tự xả PO dựa trên `quote_id` đã duyệt. |
| **P3** | `PUT` | `/api/v1/pos/{id}/receive` | Kho thực hiện Receipt. Kích hoạt Gate 3 (Allocation). |
| **P4** | `POST` | `/api/v1/inventory/upload-cert` | Upload file MTR/CO. Push sang API Gemini OCR check valid mác thép/Nhiệt độ. |
