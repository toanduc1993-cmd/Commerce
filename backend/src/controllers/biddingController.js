const prisma = require('../lib/prisma');

/**
 * M2.1: Tạo RFQ (Request for Quotation)
 * Dựa trên PrDetail.id để lấy thông tin vật tư và gửi cho vendor
 * POST /api/v1/rfq/generate
 * Body: { prId, vendorIds?: string[], notes?: string }
 */
const generateRFQ = async (req, res, next) => {
  try {
    const { prId, vendorIds, notes } = req.body;
    if (!prId) return res.status(400).json({ error: 'Thiếu prId.' });

    // Lấy thông tin PR + items
    const pr = await prisma.purchaseRequisition.findUnique({
      where: { id: prId },
      include: {
        project: true,
        details: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            profile: true,
            grade: true,
            uom: true,
            reqQty: true,
            reqWeight: true,
            urgency: true,
            materialGroupCode: true,
          },
          orderBy: { itemCode: 'asc' },
        },
      },
    });

    if (!pr) return res.status(404).json({ error: `PR ${prId} không tồn tại.` });
    if (pr.details.length === 0) return res.status(400).json({ error: 'PR không có item nào.' });

    // Tạo BidAnalysis (1 bid session per PR)
    const existingBid = await prisma.bidAnalysis.findFirst({ where: { prId } });
    let bid = existingBid;

    if (!bid) {
      bid = await prisma.bidAnalysis.create({
        data: { prId, status: 'PENDING' },
      });
    }

    // Audit log
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          action: 'CREATE_RFQ',
          userId: req.user.id,
          entityType: 'BidAnalysis',
          entityId: bid.id,
          details: JSON.stringify({
            prId,
            itemCount: pr.details.length,
            vendorCount: vendorIds?.length || 0,
          }),
        },
      });
    }

    // Build RFQ data để frontend/email xuất ra
    const rfqData = {
      rfqNo: `RFQ-${pr.project.code}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${bid.id.slice(0, 6).toUpperCase()}`,
      project: { code: pr.project.code, name: pr.project.name, client: pr.project.client },
      prRef: pr.prRef,
      department: pr.department,
      generatedAt: new Date().toISOString(),
      targetVendors: vendorIds || [],
      notes: notes || '',
      bidId: bid.id,
      items: pr.details.map((d, idx) => ({
        no: idx + 1,
        itemCode: d.itemCode,
        itemName: d.itemName,
        profile: d.profile,
        grade: d.grade,
        uom: d.uom,
        reqQty: d.reqQty,
        reqWeight: d.reqWeight,
        urgency: d.urgency,
        group: d.materialGroupCode,
      })),
    };

    res.status(200).json({
      success: true,
      message: `Đã tạo RFQ ${rfqData.rfqNo} với ${pr.details.length} mã vật tư.`,
      bid_id: bid.id,
      rfq: rfqData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * M2.2: Vendor nộp báo giá
 * POST /api/v1/bids/vendor-portal
 * Body: { bidId, vendorName, vendorCode?, items: [{ itemCode, unitPrice, totalPrice, deliveryDays, certOrigin, notes }], currency? }
 */
const submitQuotation = async (req, res, next) => {
  try {
    const { bidId, vendorName, vendorCode, items, currency = 'VND', notes } = req.body;
    if (!bidId || !vendorName || !items?.length) {
      return res.status(400).json({ error: 'Thiếu bidId, vendorName hoặc items.' });
    }

    const bid = await prisma.bidAnalysis.findUnique({ where: { id: bidId } });
    if (!bid) return res.status(404).json({ error: `BidAnalysis ${bidId} không tồn tại.` });

    const totalPrice = items.reduce((sum, i) => sum + (parseFloat(i.totalPrice) || 0), 0);
    const deliveryDays = Math.max(...items.map((i) => parseInt(i.deliveryDays) || 0));

    const quotation = await prisma.quotation.create({
      data: {
        bidId,
        vendorName,
        vendorCode: vendorCode || null,
        totalPrice,
        unitPrice: items.length === 1 ? parseFloat(items[0].unitPrice) || 0 : 0,
        currency,
        deliveryDays,
        certOrigin: items[0]?.certOrigin || null,
        notes: notes || null,
        isWinner: false,
      },
    });

    res.status(200).json({
      success: true,
      message: `Vendor ${vendorName} đã nộp báo giá thành công.`,
      quotation_id: quotation.id,
      total_price: totalPrice,
      currency,
      delivery_days: deliveryDays,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * M2.3 / Gate 1.5: So sánh báo giá — Ma trận phân tích
 * GET /api/v1/bids/:prId/analysis-matrix
 *
 * Gate 1.5 logic:
 *  - Loại NCC nếu certOrigin nằm ngoài whitelist của project
 *  - Loại NCC nếu deliveryDays > deadline
 *  - Đề xuất NCC rẻ nhất còn lại
 */
const compareBids = async (req, res, next) => {
  try {
    const { prId } = req.params;

    const bid = await prisma.bidAnalysis.findFirst({
      where: { prId },
      include: {
        quotations: { orderBy: { totalPrice: 'asc' } },
        pr: { include: { project: true, details: true } },
      },
    });

    if (!bid) return res.status(404).json({ error: `Chưa có BidAnalysis cho PR ${prId}.` });
    if (bid.quotations.length === 0) {
      return res.status(200).json({
        success: true,
        gate: '1.5 (Ma trận Báo Giá)',
        bid_id: bid.id,
        message: 'Chưa có báo giá nào được nộp.',
        quotations: [],
        recommendation: null,
        disqualified: [],
      });
    }

    // Whitelist certOrigin đơn giản — có thể config per project sau
    const CERT_WHITELIST = ['Nhật Bản', 'Hàn Quốc', 'EU', 'Mỹ', 'Việt Nam', 'JIS', 'ASME', 'EN'];
    const MAX_DELIVERY_DAYS = 120; // Hạn giao hàng mặc định

    const qualified = [];
    const disqualified = [];

    for (const q of bid.quotations) {
      const reasons = [];

      // Kiểm tra certOrigin
      if (q.certOrigin) {
        const isWhitelisted = CERT_WHITELIST.some((w) => q.certOrigin.includes(w));
        if (!isWhitelisted) {
          reasons.push(`Xuất xứ "${q.certOrigin}" không nằm trong Whitelist của dự án.`);
        }
      }

      // Kiểm tra delivery
      if (q.deliveryDays > MAX_DELIVERY_DAYS) {
        reasons.push(
          `Thời gian giao hàng ${q.deliveryDays} ngày vượt hạn chót ${MAX_DELIVERY_DAYS} ngày.`
        );
      }

      if (reasons.length > 0) {
        disqualified.push({
          vendor: q.vendorName,
          vendorCode: q.vendorCode,
          reasons,
          totalPrice: q.totalPrice,
        });
      } else {
        qualified.push(q);
      }
    }

    // Sắp xếp theo giá thấp nhất
    qualified.sort((a, b) => a.totalPrice - b.totalPrice);
    const winner = qualified[0] || null;

    // Tính % tiết kiệm so với giá cao nhất
    const maxPrice = bid.quotations[bid.quotations.length - 1]?.totalPrice || 0;
    const savings =
      winner && maxPrice > 0 ? (((maxPrice - winner.totalPrice) / maxPrice) * 100).toFixed(1) : '0';

    res.status(200).json({
      success: true,
      gate: '1.5 — Ma trận Báo Giá',
      bid_id: bid.id,
      pr_ref: bid.pr?.prRef,
      project: bid.pr?.project?.code,
      total_quotations: bid.quotations.length,
      qualified_count: qualified.length,
      disqualified_count: disqualified.length,
      recommendation: winner
        ? {
            vendor: winner.vendorName,
            vendorCode: winner.vendorCode,
            totalPrice: winner.totalPrice,
            currency: winner.currency,
            deliveryDays: winner.deliveryDays,
            certOrigin: winner.certOrigin,
            savingsVsHighest: `${savings}%`,
          }
        : null,
      all_qualified: qualified.map((q) => ({
        rank: qualified.indexOf(q) + 1,
        vendor: q.vendorName,
        totalPrice: q.totalPrice,
        currency: q.currency,
        deliveryDays: q.deliveryDays,
        certOrigin: q.certOrigin,
      })),
      disqualified,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * M2.4: Xác nhận người thắng thầu (BOD approve)
 * POST /api/v1/bids/:bidId/select-winner
 * Body: { quotationId }
 */
const selectWinner = async (req, res, next) => {
  try {
    const { bidId } = req.params;
    const { quotationId } = req.body;

    if (!quotationId) return res.status(400).json({ error: 'Thiếu quotationId.' });

    await prisma.$transaction(async (tx) => {
      // Reset tất cả isWinner = false
      await tx.quotation.updateMany({ where: { bidId }, data: { isWinner: false } });
      // Set winner
      await tx.quotation.update({ where: { id: quotationId }, data: { isWinner: true } });
      // Cập nhật bid status
      await tx.bidAnalysis.update({
        where: { id: bidId },
        data: { status: 'BOD_APPROVED', approvedBy: req.user?.id, approvedAt: new Date() },
      });
    });

    if (req.user) {
      await prisma.auditLog.create({
        data: {
          action: 'APPROVE_BID',
          userId: req.user.id,
          entityType: 'BidAnalysis',
          entityId: bidId,
          details: JSON.stringify({ quotationId, gate: 'Gate 1.5' }),
        },
      });
    }

    res.status(200).json({
      success: true,
      gate: 'Gate 1.5 — BOD Approved',
      message: 'Đã xác nhận nhà thầu thắng. Có thể tiến hành phát hành PO.',
      bid_id: bidId,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { generateRFQ, submitQuotation, compareBids, selectWinner };
