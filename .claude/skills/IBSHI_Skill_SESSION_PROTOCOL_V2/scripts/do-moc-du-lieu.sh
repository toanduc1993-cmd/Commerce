#!/bin/bash
# In mốc dữ liệu để so trước/sau phiên. KHÔNG ghi gì, chỉ đọc.
#
# Vì sao: mốc số liệu hỏng rất nhanh khi có phiên khác (hoặc người dùng đang bấm trên
# trình duyệt) ghi vào giữa hai lần đo. Đo lại ngay trước khi so — đừng tin số đo cũ.
# Chênh lệch không giải thích được thì HỎI, không tự sửa số.

set -uo pipefail
: "${PGURL:=postgresql://vpi_user:VpiProcurement2026!@127.0.0.1:54321/vpi_procurement}"

echo "=== MOC DU LIEU · $(git -C "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" log -1 --format=%h 2>/dev/null) ==="
psql "$PGURL" -X -q <<'SQL'
SELECT 'PurchaseOrder' AS bang, count(*)::text AS so_luong FROM "PurchaseOrder"
UNION ALL SELECT 'ContractDetail',  count(*)::text FROM "ContractDetail"
UNION ALL SELECT 'BidQuoteItem da duyet', count(*)::text FROM "BidQuoteItem" WHERE "selectedVendorName" IS NOT NULL
UNION ALL SELECT 'BidAnalysis SELECTED', count(*)::text FROM "BidAnalysis" WHERE status='SELECTED'
UNION ALL SELECT 'BidAnalysis OPEN',     count(*)::text FROM "BidAnalysis" WHERE status='OPEN'
UNION ALL SELECT 'BidGroupSelection',    count(*)::text FROM "BidGroupSelection"
UNION ALL SELECT 'BidVendorScore',       count(*)::text FROM "BidVendorScore"
UNION ALL SELECT 'BidQuoteVendor isWinner', count(*)::text FROM "BidQuoteVendor" WHERE "isWinner"
UNION ALL SELECT 'Material',  count(*)::text FROM "Material"
UNION ALL SELECT 'Vendor',    count(*)::text FROM "Vendor"
UNION ALL SELECT 'User',      count(*)::text FROM "User"
UNION ALL SELECT 'AuditLog',  count(*)::text FROM "AuditLog";
SQL
echo "=== Bang tam / chot an toan con treo ==="
psql "$PGURL" -X -q -c "SELECT tablename FROM pg_tables WHERE tablename LIKE '\_backup\_%' ORDER BY 1;" \
                  -c "SELECT conname FROM pg_constraint WHERE conname LIKE '\_guard\_%';"
