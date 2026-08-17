/**
 * techCommentController.js — F2: Làm rõ kỹ thuật per PrDetail
 *
 * GET  /api/v1/tech-comments?prId=<id>           → CHỈ những dòng có yêu cầu làm rõ
 *                                                  (kèm danh tính phiếu, dự án, và prLines)
 * GET  /api/v1/tech-comments/:prDetailId         → Thread cho 1 PrDetail
 * POST /api/v1/tech-comments/:prDetailId         → Thêm comment mới
 * PATCH /api/v1/tech-comments/:prDetailId/status → Cập nhật status (PENDING|CLARIFIED|SUBSTITUTION_REQUESTED|APPROVED|REJECTED)
 * PATCH /api/v1/tech-comments/comment/:id        → Edit/delete 1 comment
 */

const prisma = require('../lib/prisma');

// ─── List all threads for a PR ────────────────────────────────────────────────

async function listThreadsByPR(req, res, next) {
  try {
    const { prId } = req.query;
    if (!prId) return res.status(400).json({ error: 'Thiếu tham số prId' });

    // Danh tính phiếu + dự án. Trang 1c mở bằng prId trên URL và KHÔNG đọc dự án
    // đang chọn ở thanh bên, nên trước đây thanh bên ghi "0106" trong khi nội dung
    // là phiếu của gói PKG-068 mà màn hình không có cách nào biết để cảnh báo.
    const pr = await prisma.purchaseRequisition.findUnique({
      where: { id: prId },
      select: { id: true, prRef: true, docNo: true, revNo: true,
                project: { select: { id: true, code: true, name: true } } },
    });
    // Thông báo tiếng Việt: chuỗi này hiện thẳng lên giao diện. Nhánh 404 là hành vi
    // MỚI (trước đây prId không tồn tại vẫn trả 200 kèm danh sách rỗng), hay gặp nhất
    // khi mở lại một đường dẫn cũ trỏ tới phiếu đã bị gộp hoặc xoá.
    if (!pr) return res.status(404).json({ error: 'Không tìm thấy phiếu này — có thể phiếu đã bị gộp hoặc xoá. Hãy mở lại từ màn Yêu cầu mua (PR).' });

    // Mẫu số thật của phiếu, tách khỏi số dòng đang hiện.
    const totalPrLines = await prisma.prDetail.count({ where: { prId } });

    // CHỈ lấy dòng THẬT SỰ có yêu cầu làm rõ (có ít nhất một bình luận kỹ thuật).
    // Trước 17/08/2026 chỗ này lấy TOÀN BỘ dòng của phiếu rồi gán 'PENDING' cho dòng
    // chưa có bình luận, giao diện dịch ra "Chưa làm rõ" — phiếu 230 dòng hiện 230 mục
    // phải xử lý. Không có nguồn dữ liệu nào nói 230 dòng đó cần làm rõ; đó là suy diễn
    // của mã nguồn. Bộ lọc some:{} sinh EXISTS, TechComment đã có @@index([prDetailId]).
    const details = await prisma.prDetail.findMany({
      where: { prId, techComments: { some: {} } },
      orderBy: { itemCode: 'asc' },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        profile: true,
        grade: true,
        uom: true,
        reqQty: true,
        toBuyQty: true,
        urgency: true,
        techComments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });

    const rows = details.map((d) => {
      const comments = d.techComments || [];
      const latestComment = comments[comments.length - 1] || null;
      // Lấy trạng thái từ bình luận GẦN NHẤT CÓ ĐẶT trạng thái. Bình luận loại 'NOTE'
      // để threadStatus = null; nếu đọc thẳng bình luận cuối thì một ghi chú vu vơ sẽ
      // kéo luồng đã CLARIFIED tụt ngược về PENDING.
      const coTrangThai = [...comments].reverse().find((c) => c.threadStatus);
      const threadStatus = coTrangThai ? coTrangThai.threadStatus : 'PENDING';

      return {
        prDetailId: d.id,
        itemCode: d.itemCode,
        itemName: d.itemName,
        profile: d.profile,
        grade: d.grade,
        uom: d.uom,
        reqQty: d.reqQty,
        toBuyQty: d.toBuyQty,
        urgency: d.urgency,
        commentCount: comments.length,
        threadStatus,
        latestComment: latestComment
          ? {
              id: latestComment.id,
              content: latestComment.content,
              commentType: latestComment.commentType,
              authorName: latestComment.author?.name || 'Unknown',
              authorRole: latestComment.author?.role || '',
              createdAt: latestComment.createdAt,
            }
          : null,
        comments: comments.map((c) => ({
          id: c.id,
          content: c.content,
          commentType: c.commentType,
          threadStatus: c.threadStatus,
          tags: c.tags,
          authorId: c.authorId,
          authorName: c.author?.name || 'Unknown',
          authorRole: c.author?.role || '',
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      };
    });

    // Còn vướng = yêu cầu đã nêu nhưng chưa chốt. REJECTED xếp vào nhóm còn vướng:
    // đề nghị chuyển đổi bị từ chối nghĩa là vẫn phải mua theo yêu cầu gốc, chưa xong.
    const CON_VUONG = ['PENDING', 'IN_DISCUSSION', 'SUBSTITUTION_REQUESTED', 'REJECTED'];
    const dem = (tt) => rows.filter((r) => r.threadStatus === tt).length;
    const conVuong = rows.filter((r) => CON_VUONG.includes(r.threadStatus)).length;

    const summary = {
      // total = TỔNG DÒNG CỦA PHIẾU, không phải số dòng đang hiện (rows.length).
      // Đổi nghĩa mà giữ tên: chỗ nào đọc summary.total phải hiểu lại cho đúng.
      total: totalPrLines,
      raised: rows.length,          // số dòng CÓ yêu cầu làm rõ
      openIssues: conVuong,         // trong đó, số dòng chưa chốt
      pending: dem('PENDING'),
      inDiscussion: dem('IN_DISCUSSION'),
      clarified: dem('CLARIFIED'),
      substitutionRequested: dem('SUBSTITUTION_REQUESTED'),
      approved: dem('APPROVED'),
      rejected: dem('REJECTED'),
      // Sẵn sàng hỏi giá = mọi dòng của phiếu TRỪ những dòng đang vướng làm rõ.
      // Cách cũ đếm cả 'PENDING' vào diện sẵn sàng nên nút ghi "230 SKU sẵn sàng"
      // ngay bên trên 230 thẻ "Chưa làm rõ" — tự mâu thuẫn.
      readyForRFQ: totalPrLines - conVuong,
    };

    // prLines: danh sách dòng vật tư của phiếu, để biểu mẫu nêu yêu cầu làm rõ có
    // cái mà chọn. Sau khi lọc rows, đây là đường DUY NHẤT tạo được yêu cầu mới.
    const prLines = await prisma.prDetail.findMany({
      where: { prId },
      orderBy: { itemCode: 'asc' },
      select: { id: true, itemCode: true, itemName: true, profile: true, grade: true, uom: true },
    });

    return res.json({
      prId,
      pr: { prRef: pr.prRef, docNo: pr.docNo, revNo: pr.revNo },
      project: pr.project,
      summary,
      rows,
      prLines,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Get single thread ────────────────────────────────────────────────────────

async function getThread(req, res, next) {
  try {
    const { prDetailId } = req.params;

    const detail = await prisma.prDetail.findUnique({
      where: { id: prDetailId },
      include: {
        techComments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });

    if (!detail) return res.status(404).json({ error: 'PrDetail not found' });

    return res.json({
      prDetailId: detail.id,
      itemCode: detail.itemCode,
      itemName: detail.itemName,
      comments: detail.techComments.map((c) => ({
        id: c.id,
        content: c.content,
        commentType: c.commentType,
        threadStatus: c.threadStatus,
        tags: c.tags,
        authorId: c.authorId,
        authorName: c.author?.name || 'Unknown',
        authorRole: c.author?.role || '',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Add comment ──────────────────────────────────────────────────────────────

async function addComment(req, res, next) {
  try {
    const { prDetailId } = req.params;
    const { content, commentType, threadStatus, tags } = req.body;
    const authorId = req.user?.id;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'content required' });
    }

    const validCommentTypes = ['QUESTION', 'ANSWER', 'SUBSTITUTION_REQUEST', 'APPROVAL', 'REJECTION', 'NOTE'];
    const cType = validCommentTypes.includes(commentType) ? commentType : 'NOTE';

    const validStatuses = ['PENDING', 'IN_DISCUSSION', 'CLARIFIED', 'SUBSTITUTION_REQUESTED', 'APPROVED', 'REJECTED'];
    const tStatus = validStatuses.includes(threadStatus) ? threadStatus : null;

    const detail = await prisma.prDetail.findUnique({ where: { id: prDetailId } });
    if (!detail) return res.status(404).json({ error: 'PrDetail not found' });

    const comment = await prisma.techComment.create({
      data: {
        prDetailId,
        authorId: authorId || null,
        content: content.trim(),
        commentType: cType,
        threadStatus: tStatus,
        tags: tags || null,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    return res.status(201).json({
      id: comment.id,
      prDetailId: comment.prDetailId,
      content: comment.content,
      commentType: comment.commentType,
      threadStatus: comment.threadStatus,
      tags: comment.tags,
      authorId: comment.authorId,
      authorName: comment.author?.name || 'Unknown',
      authorRole: comment.author?.role || '',
      createdAt: comment.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Update thread status (quick action: Approve/Reject substitution) ─────────

async function updateThreadStatus(req, res, next) {
  try {
    const { prDetailId } = req.params;
    const { threadStatus, note } = req.body;
    const authorId = req.user?.id;

    const validStatuses = ['PENDING', 'IN_DISCUSSION', 'CLARIFIED', 'SUBSTITUTION_REQUESTED', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(threadStatus)) {
      return res.status(400).json({ error: 'Invalid threadStatus' });
    }

    const detail = await prisma.prDetail.findUnique({ where: { id: prDetailId } });
    if (!detail) return res.status(404).json({ error: 'PrDetail not found' });

    // Auto-post a system comment to record the status change
    const typeMap = {
      APPROVED: 'APPROVAL',
      REJECTED: 'REJECTION',
      CLARIFIED: 'ANSWER',
      SUBSTITUTION_REQUESTED: 'SUBSTITUTION_REQUEST',
    };
    const commentType = typeMap[threadStatus] || 'NOTE';
    const defaultContent = note || `Trạng thái cập nhật: ${threadStatus}`;

    const comment = await prisma.techComment.create({
      data: {
        prDetailId,
        authorId: authorId || null,
        content: defaultContent,
        commentType,
        threadStatus,
        tags: null,
      },
    });

    return res.json({ success: true, newStatus: threadStatus, commentId: comment.id });
  } catch (err) {
    next(err);
  }
}

module.exports = { listThreadsByPR, getThread, addComment, updateThreadStatus };
