'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'react-hot-toast';
import { loginAPI } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await loginAPI(username, password);

      if (data.success && data.user) {
        toast.success(`Chào mừng ${data.user.name}`);
        // S2-1: JWT lưu trong HttpOnly cookie; chỉ giữ flag UI gate + user info hiển thị.
        localStorage.setItem('ibshi_authed', '1');
        localStorage.setItem('ibshi_user', JSON.stringify(data.user));
        setTimeout(() => router.push('/'), 800);
      } else {
        toast.error(data.message || 'Tài khoản hoặc mật khẩu không đúng');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi kết nối Server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#eff4ff] flex flex-col justify-center py-12 sm:px-6 lg:px-8 dark:bg-slate-900">
      <Toaster />
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center px-6">
          <div className="font-['Manrope'] font-extrabold text-[#1B365D] dark:text-blue-200 text-3xl mb-2">
            IBS Heavy Industry
          </div>
          <div className="text-sm text-slate-500 font-bold tracking-widest uppercase">
            Procurement Platform
          </div>
        </div>

        <div className="mt-8 bg-white dark:bg-slate-800 py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border-t-4 border-[#1B365D]">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                Tài khoản (Username Nội Bộ)
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="vidu: hungth"
                  required
                  className="appearance-none block w-full px-4 py-3 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-[#1B365D] focus:border-[#1B365D]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                Mật khẩu
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="appearance-none block w-full px-4 py-3 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-[#1B365D] focus:border-[#1B365D]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-[#1B365D] focus:ring-[#1B365D] border-slate-300 rounded"
                />
                <label
                  htmlFor="remember-me"
                  className="ml-2 block text-sm text-slate-900 dark:text-slate-300 font-medium"
                >
                  Ghi nhớ đăng nhập
                </label>
              </div>
              <div className="text-sm">
                <a href="#" className="font-bold text-[#1B365D] hover:underline">
                  Quên mật khẩu?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-[#1B365D] hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1B365D] transition-colors"
              >
                {loading ? 'Đang xác thực...' : 'Đăng Nhập Hệ Thống'}
              </button>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded">
                Chưa có tài khoản? Liên hệ Quản trị viên hệ thống để được cấp.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
