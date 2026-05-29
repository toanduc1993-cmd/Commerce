-- B-CPVT-012: Add bank + accountNo fields to Vendor (enrich từ OCRP vendor_master_v1)
-- Apply: psql -U vpi_user -d vpi_procurement -1 -f this_file.sql

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "bank" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "accountNo" TEXT;

-- Verify
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Vendor' AND column_name IN ('bank', 'accountNo');
