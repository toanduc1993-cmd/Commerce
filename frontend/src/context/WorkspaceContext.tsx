'use client';

/**
 * context/WorkspaceContext.tsx — UI-1-3: Project workspace selector
 *
 * Giữ "dự án đang tập trung" dùng chung toàn ứng dụng.
 * Thanh bên → setProject → các trang lọc theo dự án đang chọn.
 *
 * Lưu vị trí: localStorage `ibshi_workspace_project_id`.
 *
 * 17/08/2026 — trước đây `allProjects` trả thẳng hằng số `PROJECTS` ghi cứng 4 dự án,
 * trong khi cơ sở dữ liệu đã có 66 (sau đợt nạp 57 dự án từ kho theo dõi của anh Đức).
 * Nay nạp từ `GET /api/v1/projects`. Hằng số PROJECTS GIỮ LẠI làm bản dự phòng —
 * hiện lên ngay khi chưa nạp xong và khi API lỗi, để thanh bên không bao giờ rỗng.
 * (PROJECTS còn được 8 nơi khác nhập trực tiếp, không đụng tới.)
 *
 * Dùng:
 *   const { project, setProject, allProjects, dangTai } = useWorkspace();
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { PROJECTS, type Project } from '@/context/ProjectContext';
import { fetchProjects, type ProjectRow } from '@/lib/api';

interface WorkspaceContextValue {
  project: Project | null;
  setProject: (p: Project | null) => void;
  allProjects: Project[];
  isAll: boolean;
  /** true khi danh sách trên màn hình vẫn là bản dự phòng, chưa có dữ liệu thật. */
  dangTai: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = 'ibshi_workspace_project_id';
const TRANG_THAI = new Set(['active', 'completed', 'on-hold']);

/** ProjectRow (API) → Project (kiểu dùng trong giao diện). */
function doiSang(r: ProjectRow): Project {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    client: r.client ?? '',
    refNo: r.refNo ?? '',
    status: (TRANG_THAI.has(r.status) ? r.status : 'active') as Project['status'],
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('vi-VN') : '',
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [project, setProjectState] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>(PROJECTS);
  const [dangTai, setDangTai] = useState(true);
  const [maDaLuu, setMaDaLuu] = useState<string | null>(null);

  // Đọc lựa chọn cũ. Chỉ ghi nhớ mã ở đây, chưa dò vội — lúc này danh sách
  // có thể vẫn là bản dự phòng, dò ngay sẽ không thấy dự án thật.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setMaDaLuu(localStorage.getItem(STORAGE_KEY));
  }, []);

  // Nạp danh sách thật. Lỗi thì im lặng giữ bản dự phòng — thanh bên vẫn dùng được.
  useEffect(() => {
    let huy = false;
    (async () => {
      try {
        const ds = await fetchProjects();
        if (huy || !ds?.length) return;
        setAllProjects(ds.map(doiSang).sort((a, b) => a.code.localeCompare(b.code, 'vi')));
      } catch {
        /* giữ PROJECTS */
      } finally {
        if (!huy) setDangTai(false);
      }
    })();
    return () => {
      huy = true;
    };
  }, []);

  // Khôi phục lựa chọn sau khi danh sách đổi.
  // Mã cũ trong localStorage là mã giả ('p001'…) của hằng số ghi cứng nên sẽ không
  // khớp mã thật; khi đó về "Tất cả dự án" — đúng và an toàn.
  useEffect(() => {
    if (!maDaLuu) return;
    const thay = allProjects.find((p) => p.id === maDaLuu);
    if (thay) setProjectState((cu) => (cu?.id === thay.id ? cu : thay));
  }, [maDaLuu, allProjects]);

  const setProject = (p: Project | null) => {
    setProjectState(p);
    if (typeof window !== 'undefined') {
      if (p) localStorage.setItem(STORAGE_KEY, p.id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <WorkspaceContext.Provider value={{ project, setProject, allProjects, isAll: !project, dangTai }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    // Trang chưa được bọc provider (mã cũ) — vẫn chạy được với bản dự phòng.
    return { project: null, setProject: () => {}, allProjects: PROJECTS, isAll: true, dangTai: false };
  }
  return ctx;
}
