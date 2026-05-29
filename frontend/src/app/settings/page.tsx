'use client';

/**
 * /settings — Cấu hình cá nhân (đổi mật khẩu)
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { changePasswordAPI } from '@/lib/api';
import { toast, Toaster } from 'react-hot-toast';

export default function SettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<{ name?: string; username?: string; role?: string } | null>(
    null
  );

  useEffect(() => {
    if (!localStorage.getItem('ibshi_authed')) {
      router.push('/login');
      return;
    }
    const raw = localStorage.getItem('ibshi_user');
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }, [router]);

  const checkStrength = (pw: string): { score: number; label: string; color: string } => {
    if (pw.length < 8) return { score: 0, label: 'Quá ngắn', color: 'bg-red-500' };
    let score = 0;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    const labels = ['Yếu', 'Trung bình', 'Khá', 'Mạnh', 'Rất mạnh'];
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-emerald-600'];
    return { score, label: labels[score], color: colors[score] };
  };

  const strength = checkStrength(newPassword);

  const handleSubmit = async () => {
    if (!currentPassword) {
      toast.error('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Mật khẩu mới phải có ít nhất 8 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp');
      return;
    }
    if (newPassword === currentPassword) {
      toast.error('Mật khẩu mới phải khác mật khẩu cũ');
      return;
    }

    setSaving(true);
    try {
      const r = await changePasswordAPI(currentPassword, newPassword);
      if (r.success) {
        toast.success('Đã đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
        setTimeout(async () => {
          try {
            const { logoutAPI } = await import('@/lib/api');
            await logoutAPI();
          } catch {
            /* ignore */
          }
          localStorage.removeItem('ibshi_authed');
          localStorage.removeItem('ibshi_user');
          localStorage.removeItem('ibshi_token');
          router.push('/login');
        }, 1500);
      } else {
        toast.error(r.message || 'Lỗi đổi mật khẩu');
      }
    } catch (err) {
      toast.error(`Lỗi: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" />
      <Sidebar />

      <div className="flex-1 ml-64 px-8 pt-8 pb-12 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-black text-[#1B365D]">Cài Đặt Tài Khoản</h1>
          <p className="text-xs text-slate-400 mt-0.5">Bảo mật và cá nhân hoá</p>
        </div>

        {/* User info */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#1B365D] text-white flex items-center justify-center text-xl font-black">
              {(user?.name || '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-bold text-[#1B365D]">{user?.name || 'User'}</div>
              <div className="text-xs text-slate-500">
                @{user?.username} ·{' '}
                <span className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-black text-[#1B365D]">Đổi mật khẩu</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Mật khẩu mới phải có ít nhất 8 ký tự. Khuyến nghị 12+ ký tự với chữ hoa, chữ thường,
              số và ký tự đặc biệt.
            </p>
          </div>

          <PwField
            label="Mật khẩu hiện tại"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            setShow={setShowCurrent}
          />

          <div>
            <PwField
              label="Mật khẩu mới"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              setShow={setShowNew}
            />
            {newPassword && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all ${strength.color}`}
                      style={{ width: `${((strength.score + 1) / 5) * 100}%` }}
                    />
                  </div>
                  <div className="text-[10px] font-bold text-slate-600 w-20 text-right">
                    {strength.label}
                  </div>
                </div>
              </div>
            )}
          </div>

          <PwField
            label="Xác nhận mật khẩu mới"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showNew}
            setShow={setShowNew}
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <div className="text-[10px] text-red-600">Mật khẩu xác nhận không khớp</div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-[#1B365D] text-white rounded-lg text-xs font-bold hover:bg-[#0f2340] disabled:opacity-50"
            >
              {saving ? 'Đang lưu…' : 'Đổi mật khẩu'}
            </button>
          </div>
        </div>

        {/* Security tips */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-amber-600 text-[20px]">
              lightbulb
            </span>
            <div className="text-[11px] text-amber-900 leading-relaxed">
              <div className="font-bold mb-1">Khuyến nghị bảo mật trước khi go-live:</div>
              <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                <li>Đổi mật khẩu mặc định của mọi tài khoản admin</li>
                <li>Không dùng mật khẩu dễ đoán (123456, password, tên công ty...)</li>
                <li>Không chia sẻ tài khoản giữa nhiều người — mỗi user 1 account</li>
                <li>Đăng xuất khi rời máy, không lưu token trên máy công cộng</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PwField({
  label,
  value,
  onChange,
  show,
  setShow,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#1B365D] pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <span className="material-symbols-outlined text-[16px]">
            {show ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
    </div>
  );
}
