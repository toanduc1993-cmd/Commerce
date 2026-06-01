/**
 * techCommentController.js — F2: Làm rõ kỹ thuật per PrDetail
 *
 * GET  /api/v1/tech-comments?prId=<id>           → Lấy tất cả threads của 1 PR
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
      // Derive status from latest comment type, or default PENDING
      const threadStatus = comments.length === 0
        ? 'PENDING'
        : (latestComment.threadStatus || 'PENDING');

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

    const summary = {
      total: rows.length,
      pending: rows.filter((r) => r.threadStatus === 'PENDING' && r.commentCount === 0).length,
      inDiscussion: rows.filter((r) => r.threadStatus === 'IN_DISCUSSION').length,
      clarified: rows.filter((r) => r.threadStatus === 'CLARIFIED').length,
      substitutionRequested: rows.filter((r) => r.threadStatus === 'SUBSTITUTION_REQUESTED').length,
      approved: rows.filter((r) => r.threadStatus === 'APPROVED').length,
      rejected: rows.filter((r) => r.threadStatus === 'REJECTED').length,
      readyForRFQ: rows.filter((r) => ['CLARIFIED', 'APPROVED', 'PENDING'].includes(r.threadStatus) && r.commentCount >= 0).length,
    };

    return res.json({ prId, summary, rows });
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
