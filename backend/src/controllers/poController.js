const prisma = require('../lib/prisma');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode(prefix) {
  const now = new Date();
  const yy = now.getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${yy}-${rand}`;
}

// ─── M3.1: Generate PO (Gate 2 — chặn nếu lạm phát giá > 2%) ────────────────
const generatePO = async (req, res, next) => {
  try {
    const { prId, selectedItems, bidId } = req.body;
    if (!prId) return res.status(400).json({ error: 'Thiếu prId' });

    let totalEst = 0;
    let totalQuoted = 0;

    const prDetails = await prisma.prDetail.findMany({
      where: selectedItems?.length ? { id: { in: selectedItems } } : { prId },
      include: { pr: true },
    });

    if (prDetails.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy PrDetail nào.' });
    }

    for (const item of prDetails) {
      const budget = await prisma.projectBudget.findFirst({
        where: { projectId: item.pr.projectId, itemCode: item.itemCode },
      });
      if (budget?.unitPriceEst) {
        totalEst += budget.unitPriceEst * item.reqQty;
        totalQuoted += budget.unitPriceEst * item.reqQty; // Sẽ được cập nhật từ Quotation thật
      }
    }

    // Nếu có bidId thật → lấy giá từ winning quotation
    if (bidId) {
      const winnerQuote = await prisma.quotation.findFirst({
        where: { bidId, isWinner: true },
      });
      if (winnerQuote) totalQuoted = winnerQuote.totalPrice;
    }

    const budgetInflation = totalEst > 0 ? totalQuoted / totalEst - 1 : 0;

    if (budgetInflation > 0.02) {
      return res.status(403).json({
        success: false,
        gate: 'Gate 2',
        error: `Giá mua cao hơn dự toán ${(budgetInflation * 100).toFixed(2)}% (giới hạn 2%). Cần BOD phê duyệt.`,
        inflation: `${(budgetInflation * 100).toFixed(2)}%`,
        totalEst,
        totalQuoted,
      });
    }

    const poCode = generateCode('PO');

    const po = await prisma.purchaseOrder.create({
      data: {
        poCode,
        bidId: bidId || null,
        status: 'ISSUED',
        totalValue: totalQuoted,
      },
    });

    // Cập nhật trạng thái PrDetail
    const ids = prDetails.map((d) => d.id);
    await prisma.prDetail.updateMany({
      where: { id: { in: ids } },
      data: { statusFlag: 'Đã ký HĐ' },
    });

    // Audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          action: 'GEN_PO',
          userId: req.user.id,
          entityType: 'PurchaseOrder',
          entityId: po.id,
          details: JSON.stringify({ poCode, prId, itemCount: ids.length, totalValue: totalQuoted }),
        },
      });
    }

    return res.status(200).json({
      success: true,
      gate: 'Gate 2 OK',
      message: `Đã phát hành ${poCode} thành công.`,
      po_number: poCode,
      po_id: po.id,
      inflation: `${(budgetInflation * 100).toFixed(2)}%`,
    });
  } catch (error) {
    next(error);
  }
};

// ─── M3.3: Nhận hàng → tạo GRN → cập nhật Inventory ────────────────────────
const receiveMaterial = async (req, res, next) => {
  try {
    const { poNumber, warehouseLocation, lineItems, receivedBy } = req.body;
    // lineItems: [{ itemCode, itemName, uom, orderedQty, receivedQty, rejectedQty, weight, notes }]

    if (!poNumber || !lineItems || lineItems.length === 0) {
      return res.status(400).json({
        error: 'Thiếu thông tin nhận hàng: poNumber và lineItems là bắt buộc.',
      });
    }

    // Tìm PO
    const po = await prisma.purchaseOrder.findUnique({ where: { poCode: poNumber } });
    if (!po) {
      return res.status(404).json({ error: `Không tìm thấy PO ${poNumber}.` });
    }
    if (po.status === 'CANCELLED') {
      return res.status(400).json({ error: `PO ${poNumber} đã bị hủy.` });
    }

    const grnCode = generateCode('GRN');

    // Sử dụng transaction để đảm bảo toàn vẹn dữ liệu
    const result = await prisma.$transaction(async (tx) => {
      // 1. Tạo GRN header
      const grn = await tx.goodsReceivedNote.create({
        data: {
          purchaseOrderId: po.id,
          grnCode,
          warehouseLocation: warehouseLocation || 'Kho Chính',
          receivedBy: receivedBy || req.user?.id || null,
          qcStatus: 'PENDING',
        },
      });

      const inventoryUpdates = [];

      // 2. Tạo GRN line items + cập nhật inventory
      for (const line of lineItems) {
        const orderedQty = parseFloat(line.orderedQty) || 0;
        const receivedQty = parseFloat(line.receivedQty) || 0;
        const rejectedQty = parseFloat(line.rejectedQty) || 0;
        const acceptedQty = Math.max(0, receivedQty - rejectedQty);
        const receivedWeight = parseFloat(line.weight) || 0;

        // Tạo GRN line item
        await tx.gRNLineItem.create({
          data: {
            grnId: grn.id,
            itemCode: line.itemCode,
            itemName: line.itemName || line.itemCode,
            uom: line.uom || 'kg',
            orderedQty,
            receivedQty,
            rejectedQty,
            acceptedQty,
            receivedWeight,
            notes: line.notes || null,
          },
        });

        // Cập nhật inventory: upsert — tạo nếu chưa có
        const inv = await tx.inventory.findUnique({ where: { itemCode: line.itemCode } });

        if (inv) {
          const newOnHand = inv.onHandQty + acceptedQty;
          await tx.inventory.update({
            where: { itemCode: line.itemCode },
            data: {
              onHandQty: newOnHand,
              availableQty: newOnHand - inv.allocatedQty,
              lastReceivedAt: new Date(),
              warehouseLocation: warehouseLocation || inv.warehouseLocation,
            },
          });
          inventoryUpdates.push({
            itemCode: line.itemCode,
            added: acceptedQty,
            newTotal: newOnHand,
          });
        } else {
          await tx.inventory.create({
            data: {
              itemCode: line.itemCode,
              itemName: line.itemName || line.itemCode,
              uom: line.uom || 'kg',
              onHandQty: acceptedQty,
              allocatedQty: 0,
              availableQty: acceptedQty,
              warehouseLocation: warehouseLocation || 'Kho Chính',
              lastReceivedAt: new Date(),
            },
          });
          inventoryUpdates.push({
            itemCode: line.itemCode,
            added: acceptedQty,
            newTotal: acceptedQty,
          });
        }
      }

      // 3. Cập nhật trạng thái PO — check thực tế delivery vs contract qty
      const contracts = await tx.contractDetail.findMany({
        where: { purchaseOrderId: po.id },
        select: { contractQty: true, deliveredQty: true },
      });
      // Nếu PO không có ContractDetail link → coi như FULLY (không có gì để track)
      // Nếu có → tất cả contract phải có deliveredQty >= contractQty
      const allContractsDelivered =
        contracts.length === 0 ||
        contracts.every((c) => (c.deliveredQty || 0) >= (c.contractQty || 0));
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: allContractsDelivered ? 'FULLY_RECEIVED' : 'PARTIAL_RECEIVED' },
      });

      return { grn, inventoryUpdates };
    });

    // 4. Audit log (ngoài transaction)
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          action: 'GRN',
          userId: req.user.id,
          entityType: 'GoodsReceivedNote',
          entityId: result.grn.id,
          details: JSON.stringify({
            poNumber,
            grnCode,
            itemCount: lineItems.length,
            warehouse: warehouseLocation,
          }),
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Đã tạo phiếu nhập kho ${grnCode} thành công.`,
      grn_code: grnCode,
      grn_id: result.grn.id,
      inventory_updated: result.inventoryUpdates,
      next_step: 'QC cần xác nhận GRN trước khi stock được tính vào available qty chính thức.',
    });
  } catch (error) {
    next(error);
  }
};

// ─── M3.4: Gate 3 — Hard Pegging ────────────────────────────────────────────
const allocateStock = async (req, res, next) => {
  try {
    const { prDetailId, allocateQty } = req.body;
    if (!prDetailId || !allocateQty) {
      return res.status(400).json({ error: 'Thiếu prDetailId hoặc allocateQty.' });
    }

    await prisma.$transaction(async (tx) => {
      const prd = await tx.prDetail.findUnique({ where: { id: prDetailId } });
      if (!prd) throw new Error('PR Detail không tồn tại.');

      const inv = await tx.inventory.findUnique({ where: { itemCode: prd.itemCode } });
      if (!inv)
        throw new Error(`Không tìm thấy tồn kho cho mã ${prd.itemCode}. Hàng chưa được nhập kho.`);

      const available = inv.onHandQty - inv.allocatedQty;
      if (available < allocateQty) {
        throw new Error(
          `Kho còn ${available.toFixed(3)} ${inv.uom} khả dụng, ` +
            `không đủ để cấp cứng ${allocateQty} ${inv.uom}.`
        );
      }

      // Tạo hard pegging record
      await tx.hardPegging.create({
        data: {
          inventoryId: inv.id,
          prDetailId,
          peggedQty: allocateQty,
          peggedBy: req.user?.id || null,
          status: 'ACTIVE',
        },
      });

      // Cập nhật inventory
      const newAllocated = inv.allocatedQty + allocateQty;
      await tx.inventory.update({
        where: { itemCode: prd.itemCode },
        data: {
          allocatedQty: newAllocated,
          availableQty: inv.onHandQty - newAllocated,
        },
      });

      // Cập nhật trạng thái PrDetail
      await tx.prDetail.update({
        where: { id: prDetailId },
        data: { statusFlag: 'Đã nhập kho' },
      });
    });

    // Audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          action: 'ALLOCATE',
          userId: req.user.id,
          entityType: 'PrDetail',
          entityId: prDetailId,
          details: JSON.stringify({ allocateQty, gate: 'Gate 3' }),
        },
      });
    }

    res.status(200).json({
      success: true,
      gate: 'Gate 3 — Hard Pegging OK',
      message: `Đã cấp phát cứng ${allocateQty} đơn vị cho PR Detail ${prDetailId}.`,
    });
  } catch (error) {
    res.status(400).json({ success: false, gate: 'Gate 3', error: error.message });
  }
};

// ─── M3.5: QC Confirm GRN ────────────────────────────────────────────────────
const confirmQC = async (req, res, next) => {
  try {
    const { grnId, qcStatus, notes } = req.body;
    // qcStatus: PASSED | FAILED | PARTIAL

    if (!grnId || !qcStatus) {
      return res.status(400).json({ error: 'Thiếu grnId hoặc qcStatus.' });
    }
    if (!['PASSED', 'FAILED', 'PARTIAL'].includes(qcStatus)) {
      return res.status(400).json({ error: 'qcStatus phải là PASSED | FAILED | PARTIAL.' });
    }

    const grn = await prisma.goodsReceivedNote.findUnique({ where: { id: grnId } });
    if (!grn) return res.status(404).json({ error: 'GRN không tồn tại.' });

    await prisma.goodsReceivedNote.update({
      where: { id: grnId },
      data: {
        qcStatus,
        qcInspectedBy: req.user?.id || null,
        notes: notes || grn.notes,
      },
    });

    // Nếu QC FAILED → trừ lại tồn kho (vật tư bị reject)
    if (qcStatus === 'FAILED') {
      const lineItems = await prisma.gRNLineItem.findMany({ where: { grnId } });
      for (const li of lineItems) {
        if (li.rejectedQty > 0) {
          const inv = await prisma.inventory.findUnique({ where: { itemCode: li.itemCode } });
          if (inv) {
            const newOnHand = Math.max(0, inv.onHandQty - li.rejectedQty);
            await prisma.inventory.update({
              where: { itemCode: li.itemCode },
              data: { onHandQty: newOnHand, availableQty: newOnHand - inv.allocatedQty },
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `GRN ${grn.grnCode} đã được QC xác nhận: ${qcStatus}.`,
    });
  } catch (error) {
    next(error);
  }
};

// ─── M3.6: Cờ làm rõ kỹ thuật ───────────────────────────────────────────────
const updateClarificationFlag = async (req, res, next) => {
  try {
    const { prDetailId, flagStatus, comment } = req.body;
    if (!prDetailId || !flagStatus) {
      return res.status(400).json({ error: 'Thiếu prDetailId hoặc flagStatus.' });
    }

    const updatedDetail = await prisma.prDetail.update({
      where: { id: prDetailId },
      data: { statusFlag: flagStatus },
    });

    res.status(200).json({
      success: true,
      message: `Đã dán cờ [${flagStatus}] cho vật tư ${updatedDetail.itemCode}.`,
      data: {
        id: updatedDetail.id,
        itemCode: updatedDetail.itemCode,
        statusFlag: updatedDetail.statusFlag,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { generatePO, receiveMaterial, allocateStock, confirmQC, updateClarificationFlag };
