'use client';
// ============================================================
// HOOK: usePRData.ts
// Tách toàn bộ state management + business logic ra khỏi UI
// Page.tsx chỉ cần gọi hook này và truyền props xuống
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  fetchPRList,
  importPRFile,
  updateStatusFlag,
  receiveGoods,
  pegStock,
  generatePO,
} from '@/lib/api';
import type { PRDetail, PRStatus } from '@/types/procurement';

// State machine: khớp với PRStatus enum (6 bước quy trình)
const STATUS_TRANSITIONS: Record<string, string> = {
  'Chờ báo giá': 'Đang đàm phán',
  'Đang đàm phán': 'Đã ký HĐ',
  'Đã ký HĐ': 'Hàng đang về',
  'Hàng đang về': 'Đã nghiệm thu',
  'Đã nghiệm thu': 'Đã nhập kho',
  'Đã nhập kho': 'Đã nhập kho', // terminal
};

export function usePRData(projectId?: string) {
  const [prs, setPrs] = useState<PRDetail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load danh sách PR từ API ──────────────────────────────
  const loadPRs = useCallback(async () => {
    setIsFetching(true);
    try {
      const data = await fetchPRList(projectId);
      if (data.length > 0) {
        setPrs(data);
        setIsUsingMock(false);
      } else {
        setIsUsingMock(true);
        // Import mock data dynamically to avoid circular deps
        const { MOCK_PRS } = await import('@/lib/mockPRData');
        setPrs(MOCK_PRS);
      }
    } catch {
      toast.error('Không thể kết nối server. Đang dùng dữ liệu demo.', { duration: 4000 });
      const { MOCK_PRS } = await import('@/lib/mockPRData');
      setPrs(MOCK_PRS);
      setIsUsingMock(true);
    } finally {
      setIsFetching(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadPRs();
  }, [loadPRs]);

  // ── Import CSV/XLSX ───────────────────────────────────────
  const handleFileUpload = useCallback(
    async (file: File, projectCode?: string) => {
      setIsLoading(true);
      try {
        const result = await importPRFile(file, projectCode);
        if (result.success) {
          toast.success(`✅ ${result.message}`, { duration: 4000 });
          await loadPRs();
        } else if (result.dirty_details?.length) {
          toast.error(`Gate 1 từ chối: ${result.total_errors_detected} dòng lỗi`, {
            duration: 6000,
          });
          result.dirty_details.slice(0, 3).forEach((d) => {
            toast.error(`Dòng ${d.row_number}: ${d.errors[0]}`, { duration: 8000 });
          });
        } else {
          toast.error(result.message ?? 'Lỗi không xác định');
        }
      } catch (err) {
        toast.error('Lỗi mạng khi upload file');
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [loadPRs]
  );

  // ── Toggle status (state machine + API call) ──────────────
  const handleToggleStatus = useCallback(async (pr: PRDetail) => {
    const nextFlag = (STATUS_TRANSITIONS[pr.statusFlag] ?? 'Chờ báo giá') as PRStatus;

    // Optimistic update
    setPrs((prev) => prev.map((p) => (p.id === pr.id ? { ...p, statusFlag: nextFlag } : p)));

    try {
      if (pr.statusFlag === 'Đã nghiệm thu') {
        // Trigger GRN với thông tin tối thiểu
        await receiveGoods({
          poNumber: `PO-AUTO-${pr.itemCode}`,
          warehouseLocation: 'Kho Chính',
          lineItems: [
            {
              itemCode: pr.itemCode,
              itemName: pr.itemName,
              uom: pr.uom,
              orderedQty: pr.toBuyQty || pr.reqQty,
              receivedQty: pr.toBuyQty || pr.reqQty,
              rejectedQty: 0,
            },
          ],
        });
      } else if (pr.statusFlag === 'Đã nhập kho') {
        // Hard pegging
        await pegStock(pr.id, pr.toBuyQty || pr.reqQty);
      } else {
        const result = await updateStatusFlag(pr.id, nextFlag);
        if (!result.success) throw new Error('Server từ chối cập nhật');
      }
      toast.success(`${pr.itemCode}: → ${nextFlag}`);
    } catch (err) {
      // Rollback
      setPrs((prev) => prev.map((p) => (p.id === pr.id ? { ...p, statusFlag: pr.statusFlag } : p)));
      toast.error(`Không thể cập nhật: ${err instanceof Error ? err.message : 'Lỗi mạng'}`);
    }
  }, []);

  // ── Bulk toggle ───────────────────────────────────────────
  const handleBulkToggleStatus = useCallback(
    async (prIds: string[]) => {
      const targets = prs.filter((p) => prIds.includes(p.id));
      setPrs((prev) =>
        prev.map((p) =>
          prIds.includes(p.id)
            ? { ...p, statusFlag: (STATUS_TRANSITIONS[p.statusFlag] ?? p.statusFlag) as PRStatus }
            : p
        )
      );

      // Fire API calls in parallel
      const results = await Promise.allSettled(
        targets.map((pr) =>
          updateStatusFlag(pr.id, STATUS_TRANSITIONS[pr.statusFlag] ?? pr.statusFlag)
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast.error(`${failed}/${prIds.length} mục không cập nhật được`, { duration: 4000 });
      } else {
        toast.success(`Đã chuyển bước ${prIds.length} mục`);
      }
    },
    [prs]
  );

  // ── Generate PO ───────────────────────────────────────────
  const handleGeneratePO = useCallback(async () => {
    if (prs.length === 0) {
      toast.error('Vui lòng import file PR trước');
      return;
    }
    const firstPrId = prs[0].prId;
    const allItemIds = prs.map((p) => p.id);

    try {
      const result = await generatePO(firstPrId, allItemIds);
      if (result.success) {
        toast.success(`✅ PO: ${result.po_number} | Lạm phát: ${result.inflation}`, {
          duration: 5000,
        });
        await loadPRs();
      } else {
        toast.error(`❌ Gate 2 chặn!\n${result.error}\nLạm phát: ${result.inflation}`, {
          duration: 6000,
        });
      }
    } catch {
      toast.error('Lỗi mạng khi phát PO');
    }
  }, [prs, loadPRs]);

  return {
    prs,
    isLoading,
    isFetching,
    isUsingMock,
    fileInputRef,
    loadPRs,
    handleFileUpload,
    handleToggleStatus,
    handleBulkToggleStatus,
    handleGeneratePO,
  };
}
