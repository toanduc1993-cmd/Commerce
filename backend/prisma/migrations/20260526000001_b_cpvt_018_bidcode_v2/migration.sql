-- B-CPVT-018: Smart Bidcode v2 schema (parsed components + junction table)
-- Apply: psql -U vpi_user -d vpi_procurement -1 -f this_file.sql

-- 1. Add parsed components + legacy field
ALTER TABLE "BidAnalysis" ADD COLUMN IF NOT EXISTS "legacyBidCode" TEXT;
ALTER TABLE "BidAnalysis" ADD COLUMN IF NOT EXISTS "bidCodeProj" TEXT;
ALTER TABLE "BidAnalysis" ADD COLUMN IF NOT EXISTS "bidCodeYymm" TEXT;
ALTER TABLE "BidAnalysis" ADD COLUMN IF NOT EXISTS "bidCodeMat" TEXT;
ALTER TABLE "BidAnalysis" ADD COLUMN IF NOT EXISTS "bidCodeSeq" INTEGER;
ALTER TABLE "BidAnalysis" ADD COLUMN IF NOT EXISTS "bidCodeVariant" TEXT;
ALTER TABLE "BidAnalysis" ADD COLUMN IF NOT EXISTS "bidCodeUrgent" BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrate existing bidCode → legacyBidCode (96 records không match format v2)
UPDATE "BidAnalysis"
SET "legacyBidCode" = "bidCode"
WHERE "bidCode" IS NOT NULL
  AND "legacyBidCode" IS NULL
  AND "bidCode" !~ '^BID(!?)-[A-Z0-9]{3,8}-\d{4}-[A-Z]{3}-\d{3}([A-Z])?$';

-- 3. Clear bidCode for legacy (sẽ để app sinh code v2 sau)
UPDATE "BidAnalysis"
SET "bidCode" = NULL
WHERE "legacyBidCode" IS NOT NULL AND "bidCode" = "legacyBidCode";

-- 4. Add unique constraint on bidCode (null-safe)
ALTER TABLE "BidAnalysis" DROP CONSTRAINT IF EXISTS "BidAnalysis_bidCode_key";
ALTER TABLE "BidAnalysis" ADD CONSTRAINT "BidAnalysis_bidCode_key" UNIQUE ("bidCode");

-- 5. Add new indexes
CREATE INDEX IF NOT EXISTS "BidAnalysis_bidCodeProj_bidCodeYymm_idx" ON "BidAnalysis"("bidCodeProj", "bidCodeYymm");
CREATE INDEX IF NOT EXISTS "BidAnalysis_bidCodeProj_bidCodeMat_idx" ON "BidAnalysis"("bidCodeProj", "bidCodeMat");

-- 6. Junction table BidAnalysis ↔ PrDetail
CREATE TABLE IF NOT EXISTS "BidAnalysisPrLink" (
  "bidAnalysisId" TEXT NOT NULL,
  "prDetailId"    TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BidAnalysisPrLink_pkey" PRIMARY KEY ("bidAnalysisId", "prDetailId")
);

ALTER TABLE "BidAnalysisPrLink"
  DROP CONSTRAINT IF EXISTS "BidAnalysisPrLink_bidAnalysisId_fkey";
ALTER TABLE "BidAnalysisPrLink"
  ADD CONSTRAINT "BidAnalysisPrLink_bidAnalysisId_fkey"
  FOREIGN KEY ("bidAnalysisId") REFERENCES "BidAnalysis"("id") ON DELETE CASCADE;

ALTER TABLE "BidAnalysisPrLink"
  DROP CONSTRAINT IF EXISTS "BidAnalysisPrLink_prDetailId_fkey";
ALTER TABLE "BidAnalysisPrLink"
  ADD CONSTRAINT "BidAnalysisPrLink_prDetailId_fkey"
  FOREIGN KEY ("prDetailId") REFERENCES "PrDetail"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "BidAnalysisPrLink_prDetailId_idx" ON "BidAnalysisPrLink"("prDetailId");

-- Verify
-- SELECT COUNT(*) FROM "BidAnalysis" WHERE "legacyBidCode" IS NOT NULL; -- expect 96
-- \d+ "BidAnalysisPrLink"
