# 20260528144307_f_bid_a_add_5_modes_foundation — chuyển vào đây 18/08/2026

Thư mục này KHÔNG phải migration. File `migration.sql` bên trong chứa thông báo lỗi
của lệnh `prisma migrate diff` (`--to-schema-datamodel was removed`) bị ghi nhầm vào file
thay vì ra màn hình.

Hậu quả nếu để nguyên: Prisma coi đây là migration CHƯA áp dụng. Bất kỳ ai chạy
`prisma migrate dev` sẽ bị báo lệch lược đồ và được đề nghị **reset** — xoá sạch cơ sở dữ liệu.

Bản THẬT là `20260528144323_f_bid_a_add_5_modes_foundation`, đã áp dụng, vẫn nằm nguyên chỗ cũ.

Không xoá — giữ ở đây để truy vết.
