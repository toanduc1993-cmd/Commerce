// ============================================================
// COMPONENT: Sidebar.tsx — UI-1-2: Workflow-first navigation
// Restructured per UI/UX assessment 2026-05-25:
//   - Workspace selector at top (UI-1-3)
//   - Quy trình Mua sắm 7 bước (numbered) thay vì entity-flat
//   - Dữ liệu chủ (master data) tách riêng
//   - Hệ thống ở bottom
// Reference: UI_DESIGN_SYSTEM.md + ASSESSMENT (CHANGES_LOG 23:55)
// ============================================================

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { WorkspaceSelector } from './WorkspaceSelector';

interface NavItem {
  icon: string;
  label: string;
  path: string;
  // 15/08/2026 (M-09) — đổi từ số sang chuỗi để ghi được 1a / 1b / 1c.
  // Ba việc của bước 1 song song chứ không nối tiếp, nhưng vẫn cần phân biệt được
  // với nhau. Dải chỉ đường trong hai trang phụ đã ghi "1b." và "1c." từ trước —
  // giờ menu ghi giống hệt, hết cảnh một bước ba cách gọi.
  step?: string;
  badge?: string | number;
  badgeTone?: 'info' | 'warning' | 'danger' | 'success';
}

interface NavGroup {
  groupLabel: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    groupLabel: 'Tổng Quan',
    items: [
      { icon: 'view_comfy', label: 'Bảng Điều Khiển', path: '/dashboard' },
      { icon: 'folder_open', label: 'Thông Tin Dự Án', path: '/projects' },
    ],
  },
  {
    groupLabel: 'Quy Trình Mua Sắm',
    items: [
      { step: '1a', icon: 'description', label: 'Yêu cầu mua (PR)', path: '/mua-hang' },
      // 15/08/2026 — mục con của Yêu cầu mua hàng (anh Hưng chốt phương án B).
      // Không đánh số vì nó là danh mục nền của 1a, không phải một bước quy trình.
      { icon: 'category', label: 'Hạng mục chế tạo', path: '/hang-muc-che-tao' },
      { icon: 'grid_on', label: 'Phân bổ chế tạo', path: '/phan-bo-che-tao' },
      { step: '1b', icon: 'inventory_2', label: 'Kiểm tra tồn kho', path: '/kiem-tra-ton-kho' },
      { step: '1c', icon: 'engineering', label: 'Làm rõ kỹ thuật', path: '/lam-ro-ky-thuat' },
      { step: '2', icon: 'forward_to_inbox', label: 'Yêu cầu & Báo giá', path: '/bao-gia' },
      { step: '3', icon: 'how_to_reg', label: 'So sánh & Duyệt', path: '/duyet' },
      { step: '4', icon: 'handshake', label: 'Hợp đồng', path: '/hop-dong' },
      { step: '5', icon: 'warehouse', label: 'Hàng về & QC', path: '/warehouse' },
      { step: '6', icon: 'payments', label: 'Thanh toán', path: '/thanh-toan' },
      // 15/08/2026 — module Theo dõi mua hàng, tách khỏi /mua-hang.
      // KHÔNG đánh số (anh Hưng chốt 14a): nó cắt ngang cả sáu bước chứ không nằm
      // trong chuỗi, nhét vào dãy 1→6 là sai logic quy trình.
      { icon: 'fact_check', label: 'Theo dõi mua hàng', path: '/theo-doi-mua-hang' },
    ],
  },
  {
    groupLabel: 'Dữ Liệu Chủ',
    items: [
      { icon: 'domain', label: 'Nhà Cung Cấp', path: '/vendors' },
      { icon: 'inventory', label: 'Danh Mục Vật Tư', path: '/inventory' },
      { icon: 'history', label: 'Lịch Sử Mua Hàng', path: '/lich-su-mua-hang' },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { icon: 'settings', label: 'Cài Đặt', path: '/settings' },
  { icon: 'contact_support', label: 'Hỗ Trợ', path: '/support' },
];

const TONE_CLASS: Record<NonNullable<NavItem['badgeTone']>, string> = {
  info: 'badge-info',
  warning: 'badge-warning',
  danger: 'badge-danger',
  success: 'badge-success',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const { logoutAPI } = await import('@/lib/api');
      await logoutAPI();
    } catch {
      /* ignore — client-side clear is enough */
    }
    localStorage.removeItem('ibshi_authed');
    localStorage.removeItem('ibshi_user');
    localStorage.removeItem('ibshi_token');
    router.push('/login');
  };

  return (
    <aside className="h-screen w-64 fixed left-0 top-0 bg-[#eff4ff] flex flex-col py-5 z-50 border-r border-slate-200/60">
      {/* Thương hiệu — logo thay cho khối chữ cũ (14/08/2026).
          Tệp gốc: LOGO/Logo IBS-02.png, bản duy nhất nền trong suốt chữ tối. */}
      <div className="px-6 mb-4">
        <Image
          src="/brand/ibs-logo.png"
          alt="IBS Heavy Industry"
          width={989}
          height={587}
          priority
          className="h-11 w-auto object-contain object-left"
        />
      </div>

      {/* Workspace selector (UI-1-3) */}
      <div className="mb-4">
        <WorkspaceSelector />
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.groupLabel}>
            <div className="px-3 mb-1">
              <span className="label">{group.groupLabel}</span>
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.path || pathname.startsWith(item.path + '/');
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-['Inter'] transition-all duration-150 ${
                      isActive
                        ? 'bg-[var(--color-brand)] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-[#d3e4fe]/60 hover:text-[var(--color-brand)]'
                    }`}
                  >
                    {item.step !== undefined && (
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-[var(--color-brand)]/10 text-[var(--color-brand)]'
                        }`}
                        aria-hidden="true"
                      >
                        {item.step}
                      </span>
                    )}
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        isActive ? 'text-white' : 'text-slate-500'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="text-body font-medium flex-1 truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge !== null && (
                      <span
                        className={`${TONE_CLASS[item.badgeTone || 'info']} text-caption font-semibold`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {isActive && !item.badge && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/60" aria-hidden="true" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pt-4 border-t border-slate-200/80 space-y-0.5">
        {BOTTOM_ITEMS.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:bg-[#d3e4fe]/60 hover:text-[var(--color-brand)] transition-colors text-body"
          >
            <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors text-body mt-1"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          <span className="font-semibold">Đăng Xuất</span>
        </button>
      </div>
    </aside>
  );
}
