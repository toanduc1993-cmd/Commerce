'use client';

/**
 * /hang-muc-che-tao — Danh mục hạng mục chế tạo, mục con của Yêu cầu mua hàng.
 *
 * 15/08/2026 — anh Hưng chốt phương án B.
 * Trước đây 18 hạng mục bị ghi cứng trong PR090DetailView và là của ĐÚNG MỘT dự án
 * (hệ SCR của VPI-095, đuôi -U1). Dự án BRA-090 chỉ có 3 hạng mục hoàn toàn khác
 * (kết cấu thép, đóng kiện, phụ kiện) mà vẫn bị gán 18 cột kia; 10 dự án còn lại
 * chưa khai hạng mục nào. Mã ghi cứng cũng không trùng mã trong cơ sở dữ liệu
 * (BOX1-U1 vs BOX-1) nên dù có nhập phân bổ cũng không bao giờ hiện ra.
 *
 * Màn này để mỗi dự án tự khai bộ hạng mục của mình — gõ tay hoặc nhập từ Excel.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { Sidebar } from '@/components/layout/Sidebar';
import { toast, Toaster } from 'react-hot-toast';
import {
  fetchHangMucCheTao,
  themHangMucCheTao,
  suaHangMucCheTao,
  xoaHangMucCheTao,
  nhapHangMucCheTao,
  fetchProjects,
  type HangMucCheTao,
} from '@/lib/api';

/** Tiêu đề cột của file Excel — cũng là tiêu đề của tệp mẫu tải về. */
const COT_EXCEL = ['Mã hạng mục', 'Tên hạng mục', 'Thứ tự', 'Ghi chú'] as const;

interface DuAn {
  id: string;
  code: string;
  name: string;
}

interface DongMoi {
  code: string;
  name: string;
  sortOrder: string;
  ghiChu: string;
}

const DONG_TRONG: DongMoi = { code: '', name: '', sortOrder: '', ghiChu: '' };

export default function TrangHangMucCheTao() {
  const [duAns, setDuAns] = useState<DuAn[]>([]);
  const [duAnId, setDuAnId] = useState('');
  const [hangMucs, setHangMucs] = useState<HangMucCheTao[]>([]);
  const [dangTai, setDangTai] = useState(false);
  const [dongMoi, setDongMoi] = useState<DongMoi>(DONG_TRONG);
  const [dangSua, setDangSua] = useState<string | null>(null);
  const [nhap, setNhap] = useState<DongMoi>(DONG_TRONG);
  const [ketQuaNhap, setKetQuaNhap] = useState<{ nhap: number; boQua: number; loi: { dong: number; ly_do: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const duAnDangChon = useMemo(() => duAns.find((d) => d.id === duAnId), [duAns, duAnId]);

  // ── Nạp danh sách dự án ──
  useEffect(() => {
    (async () => {
      try {
        // fetchProjects trả thẳng mảng ProjectRow
        const r = await fetchProjects();
        const ds: DuAn[] = (r ?? []).map((p) => ({ id: p.id, code: p.code, name: p.name }));
        setDuAns(ds);
        if (ds.length && !duAnId) setDuAnId(ds[0].id);
      } catch {
        toast.error('Không nạp được danh sách dự án');
      }
    })();
    // chỉ chạy một lần khi mở trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const napHangMuc = useCallback(async (pid: string) => {
    if (!pid) return;
    setDangTai(true);
    try {
      const r = await fetchHangMucCheTao(pid);
      setHangMucs(r.categories ?? []);
    } catch {
      toast.error('Không nạp được danh mục hạng mục');
      setHangMucs([]);
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    void napHangMuc(duAnId);
    setKetQuaNhap(null);
    setDangSua(null);
  }, [duAnId, napHangMuc]);

  // ── Thêm một hạng mục ──
  const them = async () => {
    if (!dongMoi.code.trim() || !dongMoi.name.trim()) {
      toast.error('Cần cả mã và tên hạng mục');
      return;
    }
    const r = await themHangMucCheTao(duAnId, {
      code: dongMoi.code.trim(),
      name: dongMoi.name.trim(),
      sortOrder: dongMoi.sortOrder ? Number(dongMoi.sortOrder) : hangMucs.length + 1,
      ghiChu: dongMoi.ghiChu.trim() || null,
    });
    if (r.error) return void toast.error(r.error);
    toast.success(`Đã thêm ${r.category?.code}`);
    setDongMoi(DONG_TRONG);
    void napHangMuc(duAnId);
  };

  // ── Lưu sửa ──
  const luuSua = async (id: string) => {
    const r = await suaHangMucCheTao(id, {
      code: nhap.code.trim(),
      name: nhap.name.trim(),
      sortOrder: nhap.sortOrder ? Number(nhap.sortOrder) : undefined,
      ghiChu: nhap.ghiChu.trim() || null,
    });
    if (r.error) return void toast.error(r.error);
    toast.success('Đã lưu');
    setDangSua(null);
    void napHangMuc(duAnId);
  };

  // ── Xoá ──
  const xoa = async (hm: HangMucCheTao) => {
    const r = await xoaHangMucCheTao(hm.id);
    if (r.error) return void toast.error(r.error);
    toast.success(`Đã xoá ${hm.code}`);
    void napHangMuc(duAnId);
  };

  // ── Tải tệp mẫu ──
  const taiMau = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [...COT_EXCEL],
      ['KC-CHINH', 'Kết cấu thép chính', 1, 'ví dụ — xoá dòng này trước khi nhập'],
      ['KC-PHU', 'Kết cấu phụ', 2, ''],
    ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 42 }, { wch: 8 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, ws, 'HangMuc');
    XLSX.writeFile(wb, `hang-muc-che-tao_${duAnDangChon?.code ?? 'mau'}.xlsx`);
  };

  // ── Nhập từ Excel ──
  const chonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!rows.length) {
        toast.error('File không có dòng nào');
        return;
      }
      const gui = rows.map((r) => ({
        code: String(r['Mã hạng mục'] ?? '').trim(),
        name: String(r['Tên hạng mục'] ?? '').trim(),
        sortOrder: Number(r['Thứ tự']) || undefined,
        ghiChu: String(r['Ghi chú'] ?? '').trim() || null,
      }));
      const kq = await nhapHangMucCheTao(duAnId, gui);
      if (kq.error) return void toast.error(kq.error);
      setKetQuaNhap({ nhap: kq.soDongNhap ?? 0, boQua: kq.soDongBoQua ?? 0, loi: kq.loi ?? [] });
      toast.success(`Đã nhập ${kq.soDongNhap} hạng mục`);
      void napHangMuc(duAnId);
    } catch {
      toast.error('Không đọc được file — kiểm tra lại định dạng');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f6fb]">
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        {/* ── Đầu trang — đứng yên ── */}
        <div className="bg-white border-b border-slate-200 px-8 py-5 shrink-0">
          <div className="flex items-center gap-2 text-caption text-slate-400 mb-1">
            <span>Bước 1</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span>1a. Yêu cầu mua (PR)</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="font-medium text-slate-600">Hạng mục chế tạo</span>
          </div>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-heading font-bold text-[var(--color-brand,#002046)]">
                Hạng Mục Chế Tạo
              </h1>
              <p className="text-caption text-slate-500 mt-1 max-w-2xl">
                Mỗi dự án có bộ hạng mục riêng. Vật tư trong PR sẽ được phân bổ theo các
                hạng mục khai ở đây.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <label className="text-caption text-slate-500">
                Dự án
                <select
                  value={duAnId}
                  onChange={(e) => setDuAnId(e.target.value)}
                  className="mt-1 block w-72 rounded-lg border border-slate-300 px-3 py-2 text-body bg-white"
                >
                  {duAns.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <Link
                href="/phan-bo-che-tao"
                className="px-3 py-2 rounded-lg border border-slate-300 text-body hover:border-[#1B365D] transition-colors whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px] align-middle mr-1">grid_on</span>
                Lưới phân bổ
              </Link>
              <button
                onClick={taiMau}
                className="px-3 py-2 rounded-lg border border-slate-300 text-body hover:border-[#1B365D] transition-colors whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px] align-middle mr-1">download</span>
                Tệp mẫu
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-2 rounded-lg bg-[#1B365D] text-white text-body hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px] align-middle mr-1">upload_file</span>
                Nhập từ Excel
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={chonFile}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* ── Vùng cuộn ── */}
        <div className="flex-1 overflow-auto min-h-0 px-8 py-6 space-y-5">
          {/* Kết quả lần nhập gần nhất */}
          {ketQuaNhap && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-body font-semibold text-slate-700">
                <span className="material-symbols-outlined text-[18px] text-emerald-600">task_alt</span>
                Nhập xong: {ketQuaNhap.nhap} hạng mục
                {ketQuaNhap.boQua > 0 && ` · bỏ qua ${ketQuaNhap.boQua} dòng`}
              </div>
              {ketQuaNhap.loi.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-caption text-amber-700">
                  {ketQuaNhap.loi.map((l) => (
                    <li key={l.dong}>Dòng {l.dong} trong file: {l.ly_do}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Định dạng file */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-caption font-semibold text-slate-600 uppercase tracking-wider mb-2">
              Định dạng file Excel
            </div>
            <div className="overflow-x-auto">
              <table className="text-caption border-collapse">
                <thead>
                  <tr>
                    {COT_EXCEL.map((c) => (
                      <th key={c} className="border border-slate-300 bg-slate-50 px-3 py-1.5 text-left font-medium whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-slate-500">
                    <td className="border border-slate-200 px-3 py-1.5 font-mono">KC-CHINH</td>
                    <td className="border border-slate-200 px-3 py-1.5">Kết cấu thép chính</td>
                    <td className="border border-slate-200 px-3 py-1.5">1</td>
                    <td className="border border-slate-200 px-3 py-1.5">không bắt buộc</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-caption text-slate-500 mt-2">
              Đọc sheet đầu tiên. <b>Mã hạng mục</b> và <b>Tên hạng mục</b> bắt buộc; thiếu thì
              bỏ qua dòng đó và báo lại số dòng. Nhập lại cùng một mã thì <b>cập nhật</b>, không
              đẻ thêm dòng mới — nhập đè nhiều lần vẫn an toàn.
            </p>
          </div>

          {/* Bảng hạng mục */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-body font-semibold text-slate-700">
                {duAnDangChon?.code} — {hangMucs.length} hạng mục
              </div>
            </div>

            {dangTai ? (
              <div className="flex items-center justify-center py-14 text-slate-400">
                <span className="material-symbols-outlined animate-spin text-[24px] mr-2">progress_activity</span>
                Đang tải…
              </div>
            ) : hangMucs.length === 0 ? (
              // Trạng thái rỗng — đúng lời anh Hưng: nói rõ chưa được phân bổ theo hạng mục thi công
              <div className="flex flex-col items-center justify-center py-14 gap-2 text-center px-6">
                <span className="material-symbols-outlined text-[42px] text-slate-300">category</span>
                <div className="text-body text-slate-600 font-medium">
                  Dự án này chưa được phân bổ theo hạng mục thi công
                </div>
                <div className="text-caption text-slate-400 max-w-md">
                  Thêm hạng mục bằng dòng nhập bên dưới, hoặc tải tệp mẫu rồi nhập từ Excel.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="px-3 py-2 text-left font-medium w-16">Thứ tự</th>
                      <th className="px-3 py-2 text-left font-medium w-40">Mã hạng mục</th>
                      <th className="px-3 py-2 text-left font-medium">Tên hạng mục</th>
                      <th className="px-3 py-2 text-left font-medium">Ghi chú</th>
                      <th className="px-3 py-2 text-right font-medium w-28">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {hangMucs.map((hm) =>
                      dangSua === hm.id ? (
                        <tr key={hm.id} className="bg-blue-50/40">
                          <td className="px-3 py-1.5">
                            <input
                              value={nhap.sortOrder}
                              onChange={(e) => setNhap({ ...nhap, sortOrder: e.target.value })}
                              className="w-14 rounded border border-slate-300 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={nhap.code}
                              onChange={(e) => setNhap({ ...nhap, code: e.target.value })}
                              className="w-36 rounded border border-slate-300 px-2 py-1 font-mono"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={nhap.name}
                              onChange={(e) => setNhap({ ...nhap, name: e.target.value })}
                              className="w-full rounded border border-slate-300 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              value={nhap.ghiChu}
                              onChange={(e) => setNhap({ ...nhap, ghiChu: e.target.value })}
                              className="w-full rounded border border-slate-300 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            <button onClick={() => luuSua(hm.id)} className="text-[#1B365D] font-medium hover:underline mr-3">
                              Lưu
                            </button>
                            <button onClick={() => setDangSua(null)} className="text-slate-400 hover:underline">
                              Huỷ
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={hm.id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-slate-500 tabular-nums">{hm.sortOrder}</td>
                          <td className="px-3 py-2 font-mono font-medium text-[#1B365D]">{hm.code}</td>
                          <td className="px-3 py-2 text-slate-700">{hm.name}</td>
                          <td className="px-3 py-2 text-slate-400">{hm.ghiChu || '—'}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setDangSua(hm.id);
                                setNhap({
                                  code: hm.code,
                                  name: hm.name,
                                  sortOrder: String(hm.sortOrder ?? ''),
                                  ghiChu: hm.ghiChu ?? '',
                                });
                              }}
                              className="text-slate-500 hover:text-[#1B365D] mr-3"
                            >
                              Sửa
                            </button>
                            <button onClick={() => xoa(hm)} className="text-slate-400 hover:text-red-600">
                              Xoá
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Dòng thêm mới — luôn ở cuối bảng */}
            <div className="border-t border-slate-100 px-3 py-2 flex items-center gap-2 flex-wrap bg-slate-50/60">
              <input
                value={dongMoi.sortOrder}
                onChange={(e) => setDongMoi({ ...dongMoi, sortOrder: e.target.value })}
                placeholder="Thứ tự"
                className="w-20 rounded border border-slate-300 px-2 py-1.5 text-caption"
              />
              <input
                value={dongMoi.code}
                onChange={(e) => setDongMoi({ ...dongMoi, code: e.target.value })}
                placeholder="Mã hạng mục *"
                className="w-40 rounded border border-slate-300 px-2 py-1.5 text-caption font-mono"
              />
              <input
                value={dongMoi.name}
                onChange={(e) => setDongMoi({ ...dongMoi, name: e.target.value })}
                placeholder="Tên hạng mục *"
                className="flex-1 min-w-[16rem] rounded border border-slate-300 px-2 py-1.5 text-caption"
              />
              <input
                value={dongMoi.ghiChu}
                onChange={(e) => setDongMoi({ ...dongMoi, ghiChu: e.target.value })}
                placeholder="Ghi chú"
                className="w-56 rounded border border-slate-300 px-2 py-1.5 text-caption"
              />
              <button
                onClick={them}
                className="px-3 py-1.5 rounded bg-[#1B365D] text-white text-caption font-medium hover:opacity-90"
              >
                Thêm
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
