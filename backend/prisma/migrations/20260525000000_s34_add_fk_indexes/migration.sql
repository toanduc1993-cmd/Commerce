-- Migration S3-4: Add 3 missing FK indexes (risk M11 fix)
-- Apply: psql -U vpi_user -d vpi_procurement -1 -f this_file.sql
-- Rollback: DROP INDEX IF EXISTS "ContractDetail_purchaseOrderId_idx"; (etc)

CREATE INDEX IF NOT EXISTS "ContractDetail_purchaseOrderId_idx" ON "ContractDetail"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "BidAnalysis_prId_idx" ON "BidAnalysis"("prId");
CREATE INDEX IF NOT EXISTS "BidAnalysis_prDetailId_idx" ON "BidAnalysis"("prDetailId");

-- Verify after apply:
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('ContractDetail', 'BidAnalysis') ORDER BY tablename, indexname;
