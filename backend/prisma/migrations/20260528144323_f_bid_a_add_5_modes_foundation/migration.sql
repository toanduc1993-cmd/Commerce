
-- DropForeignKey
ALTER TABLE "BidAnalysisPrLink" DROP CONSTRAINT "BidAnalysisPrLink_bidAnalysisId_fkey";

-- DropForeignKey
ALTER TABLE "BidAnalysisPrLink" DROP CONSTRAINT "BidAnalysisPrLink_prDetailId_fkey";

-- AlterTable
ALTER TABLE "BidAnalysis" ADD COLUMN     "selectionMode" TEXT NOT NULL DEFAULT 'PER_ITEM',
ADD COLUMN     "weightingCriteria" JSONB;

-- CreateTable
CREATE TABLE "BidGroupSelection" (
    "id" TEXT NOT NULL,
    "bidAnalysisId" TEXT NOT NULL,
    "materialSubGroupCode" TEXT NOT NULL,
    "selectedVendorName" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selectedBy" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "BidGroupSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidVendorScore" (
    "id" TEXT NOT NULL,
    "bidAnalysisId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "priceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoredBy" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "BidVendorScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidGroupSelection_bidAnalysisId_idx" ON "BidGroupSelection"("bidAnalysisId");

-- CreateIndex
CREATE UNIQUE INDEX "BidGroupSelection_bidAnalysisId_materialSubGroupCode_key" ON "BidGroupSelection"("bidAnalysisId", "materialSubGroupCode");

-- CreateIndex
CREATE INDEX "BidVendorScore_bidAnalysisId_idx" ON "BidVendorScore"("bidAnalysisId");

-- CreateIndex
CREATE UNIQUE INDEX "BidVendorScore_bidAnalysisId_vendorName_key" ON "BidVendorScore"("bidAnalysisId", "vendorName");

-- CreateIndex
CREATE INDEX "BidAnalysis_prId_idx" ON "BidAnalysis"("prId");

-- CreateIndex
CREATE INDEX "BidAnalysis_prDetailId_idx" ON "BidAnalysis"("prDetailId");

-- CreateIndex
CREATE INDEX "BidAnalysis_selectionMode_idx" ON "BidAnalysis"("selectionMode");

-- CreateIndex
CREATE INDEX "ContractDetail_purchaseOrderId_idx" ON "ContractDetail"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "BidGroupSelection" ADD CONSTRAINT "BidGroupSelection_bidAnalysisId_fkey" FOREIGN KEY ("bidAnalysisId") REFERENCES "BidAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidVendorScore" ADD CONSTRAINT "BidVendorScore_bidAnalysisId_fkey" FOREIGN KEY ("bidAnalysisId") REFERENCES "BidAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidAnalysisPrLink" ADD CONSTRAINT "BidAnalysisPrLink_bidAnalysisId_fkey" FOREIGN KEY ("bidAnalysisId") REFERENCES "BidAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidAnalysisPrLink" ADD CONSTRAINT "BidAnalysisPrLink_prDetailId_fkey" FOREIGN KEY ("prDetailId") REFERENCES "PrDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

