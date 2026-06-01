/**
 * inventoryCheckController.js — F1: Kiểm tra tồn kho trước RFQ
 *
 * GET  /api/v1/inventory/check?prId=<id>
 *   → Đối chiếu PrDetail.itemCode vs Inventory — trả 3 bucket: HAS_STOCK | PARTIAL | NO_STOCK
 *
 * POST /api/v1/inventory/import-stock
 *   → Nhận JSON array từ FE (đã parse Excel client-side via xlsx.js)
 *     Body: { rows: [{ itemCode, itemName, availableQty, uom, warehouseLocation? }] }
 *   → Upsert vào Inventory (onHandQty = availableQty nếu allocatedQty = 0)
 *   → Trả match summary vs PR nếu prId cũng được gửi
 *
 * PATCH /api/v1/inventory/pr-details/remain
 *   → Cập nhật remainQty + toBuyQty cho nhiều PrDetail sau khi user xác nhận phân bổ tồn
 *   → Body: { updates: [{ prDetailId, remainQty }] }
 */

const prisma = require('../lib/prisma');

// ─── 1. Check inventory for a PR ─────────────────────────────────────────────

async function checkInventoryForPR(req, res, next) {
  try {
    const { prId } = req.query;
    if (!prId) return res.status(400).json({ error: 'prId required' });

    const details = await prisma.prDetail.findMany({
      where: { prId },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        reqQty: true,
        remainQty: true,
        toBuyQty: true,
        urgency: true,
        materialGroupCode: true,
      },
    });

    if (details.length === 0) {
      return res.status(404).json({ error: 'PR not found or has no details' });
    }

    const itemCodes = [...new Set(details.map((d) => d.itemCode))];

    const inventoryRows = await prisma.inventory.findMany({
      where: { itemCode: { in: itemCodes } },
      select: { itemCode: true, itemName: true, onHandQty: true, allocatedQty: true, availableQty: true, uom: true, warehouseLocation: true },
    });

    const invMap = new Map(inventoryRows.map((i) => [i.itemCode, i]));

    const rows = details.map((d) => {
      const inv = invMap.get(d.itemCode);
      const available = inv?.availableQty ?? 0;
      let stockStatus;
      if (!inv || available <= 0) {
        stockStatus = 'NO_STOCK';
      } else if (available >= d.reqQty) {
        stockStatus = 'HAS_STOCK';
      } else {
        stockStatus = 'PARTIAL';
      }
      return {
        prDetailId: d.id,
        itemCode: d.itemCode,
        itemName: d.itemName,
        profile: d.profile,
        grade: d.grade,
        uom: d.uom,
        reqQty: d.reqQty,
        remainQty: d.remainQty,
        toBuyQty: d.toBuyQty,
        urgency: d.urgency,
        materialGroupCode: d.materialGroupCode,
        inventory: inv
          ? {
              onHandQty: inv.onHandQty,
              allocatedQty: inv.allocatedQty,
              availableQty: inv.availableQty,
              warehouseLocation: inv.warehouseLocation,
            }
          : null,
        stockStatus,
        suggestedUseFromStock: Math.min(available, d.reqQty),
      };
    });

    const summary = {
      total: rows.length,
      hasStock: rows.filter((r) => r.stockStatus === 'HAS_STOCK').length,
      partial: rows.filter((r) => r.stockStatus === 'PARTIAL').length,
      noStock: rows.filter((r) => r.stockStatus === 'NO_STOCK').length,
    };

    return res.json({ prId, summary, rows });
  } catch (err) {
    next(err);
  }
}

// ─── 2. Import stock from Excel (parsed client-side) ─────────────────────────

async function importStock(req, res, next) {
  try {
    const { rows, prId } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array required' });
    }

    const upserted = [];
    const errors = [];

    for (const row of rows) {
      const { itemCode, itemName, availableQty, onHandQty, uom, warehouseLocation } = row;
      if (!itemCode || itemCode.trim() === '') {
        errors.push({ row, reason: 'itemCode missing' });
        continue;
      }

      const qty = parseFloat(availableQty ?? onHandQty ?? 0);
      if (isNaN(qty)) {
        errors.push({ row, reason: 'invalid qty' });
        continue;
      }

      try {
        const existing = await prisma.inventory.findUnique({ where: { itemCode: itemCode.trim() } });
        if (existing) {
          await prisma.inventory.update({
            where: { itemCode: itemCode.trim() },
            data: {
              itemName: itemName || existing.itemName,
              onHandQty: qty,
              availableQty: Math.max(0, qty - (existing.allocatedQty || 0)),
              warehouseLocation: warehouseLocation || existing.warehouseLocation,
            },
          });
        } else {
          await prisma.inventory.create({
            data: {
              itemCode: itemCode.trim(),
              itemName: itemName || '',
              uom: uom || '',
              onHandQty: qty,
              allocatedQty: 0,
              availableQty: qty,
              warehouseLocation: warehouseLocation || null,
            },
          });
        }
        upserted.push(itemCode.trim());
      } catch (rowErr) {
        errors.push({ row, reason: rowErr.message });
      }
    }

    // Nếu prId được cung cấp, tự động chạy check để trả match summary
    let matchSummary = null;
    if (prId) {
      const details = await prisma.prDetail.findMany({
        where: { prId },
        select: { id: true, itemCode: true, reqQty: true },
      });
      const itemCodes = details.map((d) => d.itemCode);
      const invRows = await prisma.inventory.findMany({
        where: { itemCode: { in: itemCodes } },
        select: { itemCode: true, availableQty: true },
      });
      const invMap = new Map(invRows.map((i) => [i.itemCode, i.availableQty]));

      let exact = 0, partial = 0, none = 0;
      for (const d of details) {
        const avail = invMap.get(d.itemCode) ?? 0;
        if (avail >= d.reqQty) exact++;
        else if (avail > 0) partial++;
        else none++;
      }
      matchSummary = { total: details.length, exact, partial, none };
    }

    return res.json({
      upserted: upserted.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 10),
      matchSummary,
    });
  } catch (err) {
    next(err);
  }
}

// ─── 3. Bulk update remainQty / toBuyQty ──────────────────────────────────────

async function bulkUpdateRemainQty(req, res, next) {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array required' });
    }

    const results = [];
    for (const u of updates) {
      const { prDetailId, remainQty } = u;
      if (!prDetailId || remainQty === undefined || remainQty === null) continue;

      const detail = await prisma.prDetail.findUnique({ where: { id: prDetailId } });
      if (!detail) continue;

      const remain = Math.max(0, parseFloat(remainQty) || 0);
      const toBuy = Math.max(0, detail.reqQty - remain);

      await prisma.prDetail.update({
        where: { id: prDetailId },
        data: { remainQty: remain, toBuyQty: toBuy },
      });
      results.push({ prDetailId, remainQty: remain, toBuyQty: toBuy });
    }

    return res.json({ updated: results.length, results });
  } catch (err) {
    next(err);
  }
}

module.exports = { checkInventoryForPR, importStock, bulkUpdateRemainQty };
