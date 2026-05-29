Loaded Prisma config from prisma.config.ts.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'KY_THUAT',
    "dept" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "refNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "letter" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MaterialGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialSubGroup" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MaterialSubGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL,
    "itemCodeExamples" TEXT,
    "name" TEXT NOT NULL,
    "profile" TEXT,
    "grade" TEXT,
    "uom" TEXT NOT NULL,
    "materialSubGroupCode" TEXT,
    "unitWeightAvg" DOUBLE PRECISION,
    "nProjects" INTEGER NOT NULL DEFAULT 0,
    "totalQtyAllProjects" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalKgAllProjects" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nccSupplied" TEXT,
    "nDeliveryTotal" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'OCR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FabricationCategory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FabricationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBudget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialGroupCode" TEXT,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "profile" TEXT,
    "grade" TEXT,
    "uom" TEXT NOT NULL,
    "limitQty" DOUBLE PRECISION NOT NULL,
    "unitPriceEst" DOUBLE PRECISION,
    "totalEst" DOUBLE PRECISION,

    CONSTRAINT "ProjectBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequisition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "prRef" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "client" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrDetail" (
    "id" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "materialGroupCode" TEXT,
    "materialSubGroupCode" TEXT,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "profile" TEXT,
    "grade" TEXT,
    "uom" TEXT NOT NULL,
    "unitWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reqQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reqWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toBuyQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toBuyWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requiredDate" TIMESTAMP(3),
    "urgency" TEXT NOT NULL DEFAULT 'Normal',
    "statusFlag" TEXT NOT NULL DEFAULT 'Chờ báo giá',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrDetailFabAllocation" (
    "id" TEXT NOT NULL,
    "prDetailId" TEXT NOT NULL,
    "fabricationCategoryId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PrDetailFabAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDetail" (
    "id" TEXT NOT NULL,
    "prDetailId" TEXT,
    "purchaseOrderId" TEXT,
    "contractType" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "projectCode" TEXT,
    "ocrInvoiceStt" INTEGER,
    "ocrScanRef" TEXT,
    "contractNo" TEXT,
    "vendorName" TEXT,
    "vendorCountry" TEXT,
    "actualProfile" TEXT,
    "actualGrade" TEXT,
    "contractQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractDate" TIMESTAMP(3),
    "unitPriceNoVAT" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "totalNoVAT" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalWithVAT" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "importLCDate" TIMESTAMP(3),
    "exportPort" TEXT,
    "cifDate" TIMESTAMP(3),
    "paymentDate" TIMESTAMP(3),
    "customsDate" TIMESTAMP(3),
    "arrivedDate" TIMESTAMP(3),
    "qcInvitationDate" TIMESTAMP(3),
    "handoverDate" TIMESTAMP(3),
    "handoverToProductDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionRecord" (
    "id" TEXT NOT NULL,
    "contractDetailId" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "reportNo" TEXT,
    "inspectionDate" TIMESTAMP(3),
    "inspectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inspectedWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptedWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "result" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "prId" TEXT,
    "prDetailId" TEXT,
    "bidCode" TEXT,
    "legacyBidCode" TEXT,
    "bidCodeProj" TEXT,
    "bidCodeYymm" TEXT,
    "bidCodeMat" TEXT,
    "bidCodeSeq" INTEGER,
    "bidCodeVariant" TEXT,
    "bidCodeUrgent" BOOLEAN NOT NULL DEFAULT false,
    "subject" TEXT,
    "bidDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "selectedVendorId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "sourceFileName" TEXT,
    "sourceFilePath" TEXT,
    "sourceSheetName" TEXT,

    CONSTRAINT "BidAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidAnalysisPrLink" (
    "bidAnalysisId" TEXT NOT NULL,
    "prDetailId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidAnalysisPrLink_pkey" PRIMARY KEY ("bidAnalysisId","prDetailId")
);

-- CreateTable
CREATE TABLE "BidQuoteVendor" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorCode" TEXT,
    "vendorType" TEXT NOT NULL DEFAULT 'DOMESTIC',
    "vendorOrder" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "totalQuote" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidQuoteVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidQuoteItem" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "itemOrder" INTEGER NOT NULL DEFAULT 0,
    "itemCode" TEXT,
    "itemName" TEXT,
    "profile" TEXT,
    "grade" TEXT,
    "gradeBuy" TEXT,
    "uom" TEXT,
    "qtyPR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtyToBuy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimateUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimateTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alreadyBoughtAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selectedVendorName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidQuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidQuoteOffer" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "scope" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryTerm" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualitySource" TEXT NOT NULL DEFAULT 'EXCEL_SCRAPE',

    CONSTRAINT "BidQuoteOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorCode" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "deliveryDays" INTEGER NOT NULL DEFAULT 0,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "certOrigin" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "taxCode" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'Việt Nam',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactTitle" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "categories" TEXT,
    "vendorType" TEXT NOT NULL DEFAULT 'DOMESTIC',
    "bank" TEXT,
    "accountNo" TEXT,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "contractDetailId" TEXT,
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "supplier" TEXT,
    "saleContract" TEXT,
    "projectCode" TEXT,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "paymentMethod" TEXT,
    "signDate" TIMESTAMP(3),
    "lcDate" TIMESTAMP(3),
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "documentDate" TIMESTAMP(3),
    "paymentMonth" TEXT,
    "lcDeadline" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "paidDate" TIMESTAMP(3),
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "bidId" TEXT,
    "poCode" TEXT NOT NULL,
    "vendorName" TEXT,
    "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceivedNote" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "grnCode" TEXT NOT NULL,
    "warehouseLocation" TEXT,
    "receivedBy" TEXT,
    "qcInspectedBy" TEXT,
    "qcStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "GoodsReceivedNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GRNLineItem" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "orderedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rejectedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "GRNLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT,
    "uom" TEXT NOT NULL,
    "onHandQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocatedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "availableQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warehouseLocation" TEXT,
    "lastReceivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardPegging" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "prDetailId" TEXT NOT NULL,
    "peggedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peggedBy" TEXT,
    "peggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "HardPegging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_resolution" (
    "id" TEXT NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "resolved_by" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_resolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialGroup_code_key" ON "MaterialGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialSubGroup_code_key" ON "MaterialSubGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Material_rootKey_key" ON "Material"("rootKey");

-- CreateIndex
CREATE INDEX "Material_rootKey_idx" ON "Material"("rootKey");

-- CreateIndex
CREATE INDEX "Material_materialSubGroupCode_idx" ON "Material"("materialSubGroupCode");

-- CreateIndex
CREATE INDEX "Material_name_idx" ON "Material"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FabricationCategory_projectId_code_key" ON "FabricationCategory"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBudget_projectId_itemCode_key" ON "ProjectBudget"("projectId", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequisition_prRef_key" ON "PurchaseRequisition"("prRef");

-- CreateIndex
CREATE INDEX "PrDetail_prId_idx" ON "PrDetail"("prId");

-- CreateIndex
CREATE INDEX "PrDetail_materialGroupCode_idx" ON "PrDetail"("materialGroupCode");

-- CreateIndex
CREATE INDEX "PrDetail_itemCode_idx" ON "PrDetail"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "PrDetailFabAllocation_prDetailId_fabricationCategoryId_key" ON "PrDetailFabAllocation"("prDetailId", "fabricationCategoryId");

-- CreateIndex
CREATE INDEX "ContractDetail_prDetailId_idx" ON "ContractDetail"("prDetailId");

-- CreateIndex
CREATE INDEX "ContractDetail_purchaseOrderId_idx" ON "ContractDetail"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "ContractDetail_contractType_idx" ON "ContractDetail"("contractType");

-- CreateIndex
CREATE INDEX "ContractDetail_vendorName_idx" ON "ContractDetail"("vendorName");

-- CreateIndex
CREATE INDEX "ContractDetail_dataSource_idx" ON "ContractDetail"("dataSource");

-- CreateIndex
CREATE INDEX "ContractDetail_projectCode_idx" ON "ContractDetail"("projectCode");

-- CreateIndex
CREATE INDEX "InspectionRecord_contractDetailId_idx" ON "InspectionRecord"("contractDetailId");

-- CreateIndex
CREATE UNIQUE INDEX "BidAnalysis_bidCode_key" ON "BidAnalysis"("bidCode");

-- CreateIndex
CREATE INDEX "BidAnalysis_projectId_idx" ON "BidAnalysis"("projectId");

-- CreateIndex
CREATE INDEX "BidAnalysis_bidCode_idx" ON "BidAnalysis"("bidCode");

-- CreateIndex
CREATE INDEX "BidAnalysis_prId_idx" ON "BidAnalysis"("prId");

-- CreateIndex
CREATE INDEX "BidAnalysis_prDetailId_idx" ON "BidAnalysis"("prDetailId");

-- CreateIndex
CREATE INDEX "BidAnalysis_bidCodeProj_bidCodeYymm_idx" ON "BidAnalysis"("bidCodeProj", "bidCodeYymm");

-- CreateIndex
CREATE INDEX "BidAnalysis_bidCodeProj_bidCodeMat_idx" ON "BidAnalysis"("bidCodeProj", "bidCodeMat");

-- CreateIndex
CREATE INDEX "BidAnalysisPrLink_prDetailId_idx" ON "BidAnalysisPrLink"("prDetailId");

-- CreateIndex
CREATE INDEX "BidQuoteVendor_bidId_idx" ON "BidQuoteVendor"("bidId");

-- CreateIndex
CREATE INDEX "BidQuoteItem_bidId_idx" ON "BidQuoteItem"("bidId");

-- CreateIndex
CREATE INDEX "BidQuoteOffer_itemId_idx" ON "BidQuoteOffer"("itemId");

-- CreateIndex
CREATE INDEX "BidQuoteOffer_vendorId_idx" ON "BidQuoteOffer"("vendorId");

-- CreateIndex
CREATE INDEX "BidQuoteOffer_qualitySource_idx" ON "BidQuoteOffer"("qualitySource");

-- CreateIndex
CREATE UNIQUE INDEX "BidQuoteOffer_itemId_vendorId_key" ON "BidQuoteOffer"("itemId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");

-- CreateIndex
CREATE INDEX "Vendor_taxCode_idx" ON "Vendor"("taxCode");

-- CreateIndex
CREATE INDEX "PaymentSchedule_projectId_idx" ON "PaymentSchedule"("projectId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_supplier_idx" ON "PaymentSchedule"("supplier");

-- CreateIndex
CREATE INDEX "PaymentSchedule_paymentMonth_idx" ON "PaymentSchedule"("paymentMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poCode_key" ON "PurchaseOrder"("poCode");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceivedNote_grnCode_key" ON "GoodsReceivedNote"("grnCode");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_itemCode_key" ON "Inventory"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "alert_resolution_canonical_key_key" ON "alert_resolution"("canonical_key");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialSubGroup" ADD CONSTRAINT "MaterialSubGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MaterialGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_materialSubGroupCode_fkey" FOREIGN KEY ("materialSubGroupCode") REFERENCES "MaterialSubGroup"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricationCategory" ADD CONSTRAINT "FabricationCategory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequisition" ADD CONSTRAINT "PurchaseRequisition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrDetail" ADD CONSTRAINT "PrDetail_prId_fkey" FOREIGN KEY ("prId") REFERENCES "PurchaseRequisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrDetail" ADD CONSTRAINT "PrDetail_materialGroupCode_fkey" FOREIGN KEY ("materialGroupCode") REFERENCES "MaterialGroup"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrDetail" ADD CONSTRAINT "PrDetail_materialSubGroupCode_fkey" FOREIGN KEY ("materialSubGroupCode") REFERENCES "MaterialSubGroup"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrDetailFabAllocation" ADD CONSTRAINT "PrDetailFabAllocation_prDetailId_fkey" FOREIGN KEY ("prDetailId") REFERENCES "PrDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrDetailFabAllocation" ADD CONSTRAINT "PrDetailFabAllocation_fabricationCategoryId_fkey" FOREIGN KEY ("fabricationCategoryId") REFERENCES "FabricationCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDetail" ADD CONSTRAINT "ContractDetail_prDetailId_fkey" FOREIGN KEY ("prDetailId") REFERENCES "PrDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDetail" ADD CONSTRAINT "ContractDetail_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionRecord" ADD CONSTRAINT "InspectionRecord_contractDetailId_fkey" FOREIGN KEY ("contractDetailId") REFERENCES "ContractDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidAnalysis" ADD CONSTRAINT "BidAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidAnalysis" ADD CONSTRAINT "BidAnalysis_prId_fkey" FOREIGN KEY ("prId") REFERENCES "PurchaseRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidAnalysis" ADD CONSTRAINT "BidAnalysis_prDetailId_fkey" FOREIGN KEY ("prDetailId") REFERENCES "PrDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidAnalysisPrLink" ADD CONSTRAINT "BidAnalysisPrLink_bidAnalysisId_fkey" FOREIGN KEY ("bidAnalysisId") REFERENCES "BidAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidAnalysisPrLink" ADD CONSTRAINT "BidAnalysisPrLink_prDetailId_fkey" FOREIGN KEY ("prDetailId") REFERENCES "PrDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidQuoteVendor" ADD CONSTRAINT "BidQuoteVendor_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "BidAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidQuoteItem" ADD CONSTRAINT "BidQuoteItem_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "BidAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidQuoteOffer" ADD CONSTRAINT "BidQuoteOffer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BidQuoteItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidQuoteOffer" ADD CONSTRAINT "BidQuoteOffer_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "BidQuoteVendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "BidAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_contractDetailId_fkey" FOREIGN KEY ("contractDetailId") REFERENCES "ContractDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "BidAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GRNLineItem" ADD CONSTRAINT "GRNLineItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceivedNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardPegging" ADD CONSTRAINT "HardPegging_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
┌─────────────────────────────────────────────────────────┐
│  Update available 7.6.0 -> 7.8.0                        │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘

