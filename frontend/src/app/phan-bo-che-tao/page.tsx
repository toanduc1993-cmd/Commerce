'use client';

/**
 * /phan-bo-che-tao — Lưới phân bổ chế tạo, mục con của Yêu cầu mua hàng.
 *
 * 16/08/2026 — phần chính của phương án B anh Hưng đã chốt.
 * Dòng = vật tư của dự án · cột = hạng mục của CHÍNH dự án đó ·
 * ô = số lượng · khối lượng · ngày cần vật tư tại công trường.
 *
 * Trước đây 18 cột hạng mục bị ghi cứng trong PR090DetailView, là của đúng một
 * dự án, và mã còn không trùng mã trong cơ sở dữ liệu — nên phân bổ không bao
 * giờ hiện ra. Nay cột lấy thẳng từ danh mục hạng mục của dự án đang xem.
 *
 * Tiến độ đo bằng NGÀY: so ngày cần tại công trường với ngày hàng thực về.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { toast, Toaster } from 'react-hot-toast';
import {
  fetchLuoiPhanBo,
  luuLuoiPhanBo,
  fetchProjects,
  type CotHangMuc,
  type DongPhanBo,
  type OGuiLen,
} from '@/lib/api';

// ─── Kích thước cột ghim ─────────────────────────────────────────────────────
// Ghi bằng số rồi gắn qua style. KHÔNG dùng chuỗi lớp động kiểu min-w-[${x}]
// — Tailwind quét mã nguồn lúc dựng nên lớp ghép lúc chạy không bao giờ có CSS.
const W_PHIEU = 92;
const W_MA = 156;
const W_O = 132;

const BUOC_DONG = 100; // vẽ dần từng 100 dòng, tránh dựng 500 dòng × 14 ô cùng lúc

interface DuAn {
  id: string;
  code: string;
  name: string;
}

/** Giá trị một ô trong lúc đang sửa. */
interface OSua {
  qty: number;
  weight: number;
  ngayCan: string | null; // YYYY-MM-DD
}

const soVN = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });

/** Cắt chuỗi ISO của máy chủ về YYYY-MM-DD để so sánh và hiển thị nhất quán. */
const ngayGon = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);

const ngayVN = (s: string | null): string => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const ngayNgan = (s: string | null): string => {
  if (!s) return '';
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
};

const khoaO = (prDetailId: string, catId: string) => `${prDetailId}|${catId}`;

const oTrong = (o: OSua | null): boolean => !o || (o.qty === 0 && o.weight === 0 && !o.ngayCan);

/** Số ngày sớm/muộn. Trả null khi chưa đủ dữ kiện để nói gì. */
function tinhTienDo(
  ngayCan: string | null,
  ngayHangVe: string | null,
  homNay: string | null
): { chu: string; mau: string; ngay: number } | null {
  if (!ngayCan) return null;
  const can = Date.parse(`${ngayCan}T00:00:00Z`);
  if (Number.isNaN(can)) return null;

  if (ngayHangVe) {
    const ve = Date.parse(`${ngayHangVe}T00:00:00Z`);
    const d = Math.round((ve - can) / 86400000);
    if (d === 0) return { chu: 'Về đúng hạn', mau: 'text-emerald-600', ngay: 0 };
    return d < 0
      ? { chu: `Về sớm ${-d} ngày`, mau: 'text-emerald-600', ngay: d }
      : { chu: `Về muộn ${d} ngày`, mau: 'text-red-600 font-semibold', ngay: d };
  }

  if (!homNay) return null;
  const nay = Date.parse(`${homNay}T00:00:00Z`);
  const d = Math.round((can - nay) / 86400000);
  if (d < 0) return { chu: `Quá hạn ${-d} ngày`, mau: 'text-red-600 font-semibold', ngay: d };
  if (d === 0) return { chu: 'Cần hôm nay', mau: 'text-amber-600 font-semibold', ngay: 0 };
  return {
    chu: `Còn ${d} ngày`,
    mau: d <= 14 ? 'text-amber-600' : 'text-slate-500',
    ngay: d,
  };
}

export default function TrangPhanBoCheTao() {
  const [duAns, setDuAns] = useState<DuAn[]>([]);
  const [duAnId, setDuAnId] = useState('');
  const [hangMucs, setHangMucs] = useState<CotHangMuc[]>([]);
  const [dongs, setDongs] = useState<DongPhanBo[]>([]);
  const [dangTai, setDangTai] = useState(false);
  const [dangLuu, setDangLuu] = useState(false);

  const [sua, setSua] = useState<Map<string, OSua>>(new Map());
  const [dangChonO, setDangChonO] = useState<{ dong: DongPhanBo; cot: CotHangMuc } | null>(null);
  const [nhap, setNhap] = useState<{ qty: string; weight: string; ngayCan: string }>({
    qty: '',
    weight: '',
    ngayCan: '',
  });

  const [tim, setTim] = useState('');
  const [locTrangThai, setLocTrangThai] = useState<'tat_ca' | 'chua' | 'roi'>('tat_ca');
  const [soDongHien, setSoDongHien] = useState(BUOC_DONG);
  const [homNay, setHomNay] = useState<string | null>(null);
  const oNhapDauRef = useRef<HTMLInputElement>(null);

  // Lấy "hôm nay" sau khi gắn vào trình duyệt — tránh lệch giữa máy chủ và máy khách.
  useEffect(() => {
    setHomNay(new Date().toISOString().slice(0, 10));
  }, []);

  const duAnDangChon = useMemo(() => duAns.find((d) => d.id === duAnId), [duAns, duAnId]);

  // ── Nạp danh sách dự án ──
  useEffect(() => {
    (async () => {
      try {
        const r = await fetchProjects();
        const ds: DuAn[] = (r ?? []).map((p) => ({ id: p.id, code: p.code, name: p.name }));
        setDuAns(ds);
        if (ds.length) setDuAnId((cu) => cu || ds[0].id);
      } catch {
        toast.error('Không nạp được danh sách dự án');
      }
    })();
  }, []);

  // ── Nạp lưới ──
  const napLuoi = useCallback(async (pid: string) => {
    if (!pid) return;
    setDangTai(true);
    try {
      const r = await fetchLuoiPhanBo(pid);
      if (r.error) {
        toast.error(r.error);
        setHangMucs([]);
        setDongs([]);
        return;
      }
      setHangMucs(r.hangMucs ?? []);
      // Cắt mọi mốc ngày về YYYY-MM-DD ngay tại đây, để phần còn lại của màn
      // chỉ phải làm việc với một dạng duy nhất.
      setDongs(
        (r.items ?? []).map((d) => ({
          ...d,
          requiredDate: ngayGon(d.requiredDate),
          ngayCanSomNhat: ngayGon(d.ngayCanSomNhat),
          ngayHangVe: ngayGon(d.ngayHangVe),
          o: Object.fromEntries(
            Object.entries(d.o).map(([k, v]) => [k, { ...v, ngayCan: ngayGon(v.ngayCan) }])
          ),
        }))
      );
    } catch {
      toast.error('Không nạp được lưới phân bổ');
      setHangMucs([]);
      setDongs([]);
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    void napLuoi(duAnId);
    setSua(new Map());
    setDangChonO(null);
    setSoDongHien(BUOC_DONG);
    // Ô tìm là mã vật tư / số phiếu — của riêng một dự án. Giữ lại khi đổi dự án
    // thì lưới trông như rỗng dù dự án có hàng trăm vật tư.
    setTim('');
  }, [duAnId, napLuoi]);

  // ── Đọc một ô: bản đang sửa đè lên bản của máy chủ ──
  const layO = useCallback(
    (dong: DongPhanBo, catId: string): OSua | null => {
      const k = khoaO(dong.prDetailId, catId);
      const s = sua.get(k);
      if (s) return s;
      const g = dong.o[catId];
      return g ? { qty: g.qty, weight: g.weight, ngayCan: g.ngayCan } : null;
    },
    [sua]
  );

  // ── Tổng của một dòng, đã tính cả sửa chưa lưu ──
  const tongDong = useCallback(
    (dong: DongPhanBo) => {
      let q = 0;
      let w = 0;
      let som: string | null = null;
      let soO = 0;
      for (const c of hangMucs) {
        const o = layO(dong, c.id);
        if (oTrong(o) || !o) continue;
        q += o.qty;
        w += o.weight;
        soO += 1;
        if (o.ngayCan && (!som || o.ngayCan < som)) som = o.ngayCan;
      }
      return { q, w, som, soO, conLai: dong.reqQty - q, vuot: dong.reqQty > 0 && q > dong.reqQty + 0.001 };
    },
    [hangMucs, layO]
  );

  // ── Lọc + tìm ──
  const dongLoc = useMemo(() => {
    const t = tim.trim().toLowerCase();
    return dongs.filter((d) => {
      if (t) {
        const kho = `${d.itemCode} ${d.itemName} ${d.profile ?? ''} ${d.prRef} ${d.docNo ?? ''}`.toLowerCase();
        if (!kho.includes(t)) return false;
      }
      if (locTrangThai !== 'tat_ca') {
        const coO = tongDong(d).soO > 0;
        if (locTrangThai === 'roi' && !coO) return false;
        if (locTrangThai === 'chua' && coO) return false;
      }
      return true;
    });
  }, [dongs, tim, locTrangThai, tongDong]);

  useEffect(() => {
    setSoDongHien(BUOC_DONG);
  }, [tim, locTrangThai]);

  const dongHien = useMemo(() => dongLoc.slice(0, soDongHien), [dongLoc, soDongHien]);

  // ── Thống kê đầu trang ──
  const thongKe = useMemo(() => {
    let soODaPhanBo = 0;
    let soDongVuot = 0;
    let soQuaHan = 0;
    for (const d of dongs) {
      const t = tongDong(d);
      soODaPhanBo += t.soO;
      if (t.vuot) soDongVuot += 1;
      const td = tinhTienDo(t.som, d.ngayHangVe, homNay);
      if (td && td.ngay < 0 && !d.ngayHangVe) soQuaHan += 1;
    }
    return { soODaPhanBo, soDongVuot, soQuaHan };
  }, [dongs, tongDong, homNay]);

  // ── Mở ô để sửa ──
  const moO = (dong: DongPhanBo, cot: CotHangMuc) => {
    const o = layO(dong, cot.id);
    setDangChonO({ dong, cot });
    setNhap({
      qty: o && o.qty !== 0 ? String(o.qty) : '',
      weight: o && o.weight !== 0 ? String(o.weight) : '',
      ngayCan: o?.ngayCan ?? '',
    });
    setTimeout(() => oNhapDauRef.current?.focus(), 0);
  };

  const dongO = () => setDangChonO(null);

  /** Ghi giá trị đang gõ vào bản nháp. Không gọi máy chủ. */
  const apDungO = () => {
    if (!dangChonO) return;
    const { dong, cot } = dangChonO;
    const qty = nhap.qty.trim() === '' ? 0 : Number(nhap.qty.replace(',', '.'));
    const weight = nhap.weight.trim() === '' ? 0 : Number(nhap.weight.replace(',', '.'));
    if (!Number.isFinite(qty) || !Number.isFinite(weight)) {
      toast.error('Số lượng và khối lượng phải là số');
      return;
    }
    if (qty < 0 || weight < 0) {
      toast.error('Số lượng và khối lượng không được âm');
      return;
    }

    const moi: OSua = { qty, weight, ngayCan: nhap.ngayCan || null };
    setSua((cu) => {
      const m = new Map(cu);
      const k = khoaO(dong.prDetailId, cot.id);
      const goc = dong.o[cot.id];
      const gocRong = !goc;
      // Gõ về đúng như cũ thì bỏ khỏi bản nháp, để nút Lưu không đếm thừa.
      const giongGoc = gocRong
        ? oTrong(moi)
        : goc.qty === moi.qty && goc.weight === moi.weight && (goc.ngayCan ?? null) === moi.ngayCan;
      if (giongGoc) m.delete(k);
      else m.set(k, moi);
      return m;
    });
    setDangChonO(null);
  };

  const xoaO = () => {
    setNhap({ qty: '', weight: '', ngayCan: '' });
    if (!dangChonO) return;
    const { dong, cot } = dangChonO;
    setSua((cu) => {
      const m = new Map(cu);
      const k = khoaO(dong.prDetailId, cot.id);
      if (!dong.o[cot.id]) m.delete(k); // vốn đã trống, không cần ghi nháp
      else m.set(k, { qty: 0, weight: 0, ngayCan: null });
      return m;
    });
    setDangChonO(null);
  };

  // ── Lưu ──
  const luu = async () => {
    if (sua.size === 0) return;

    // Chặn tại chỗ trước khi gọi máy chủ — máy chủ vẫn kiểm lại lần nữa.
    const chamTran = dongs.filter((d) => tongDong(d).vuot);
    if (chamTran.length > 0) {
      toast.error(
        `${chamTran.length} vật tư có tổng phân bổ vượt số lượng yêu cầu mua: ${chamTran
          .slice(0, 3)
          .map((d) => d.itemCode)
          .join(', ')}${chamTran.length > 3 ? '…' : ''}`
      );
      return;
    }

    const cells: OGuiLen[] = [...sua.entries()].map(([k, v]) => {
      const [prDetailId, fabricationCategoryId] = k.split('|');
      return {
        prDetailId,
        fabricationCategoryId,
        qty: v.qty,
        weight: v.weight,
        ngayCanTaiCongTruong: v.ngayCan,
      };
    });

    setDangLuu(true);
    try {
      const r = await luuLuoiPhanBo(duAnId, cells);
      if (r.error) {
        toast.error(r.error, { duration: 6000 });
        if (r.vuot?.length) {
          toast.error(
            r.vuot
              .slice(0, 3)
              .map((v) => `${v.itemCode}: ${v.tongPhanBo} > ${v.reqQty} ${v.uom}`)
              .join(' · '),
            { duration: 8000 }
          );
        }
        if (r.loi?.length) {
          toast.error(r.loi.slice(0, 3).map((l) => `Ô ${l.o}: ${l.ly_do}`).join(' · '), {
            duration: 8000,
          });
        }
        return;
      }
      toast.success(r.message ?? 'Đã lưu');
      if (r.canhBao?.length) {
        toast(
          `${r.canhBao.length} vật tư chưa có số lượng yêu cầu mua nên không đối chiếu được trần`,
          { icon: '⚠️', duration: 7000 }
        );
      }
      setSua(new Map());
      await napLuoi(duAnId);
    } catch {
      toast.error('Không lưu được — kiểm tra kết nối rồi thử lại');
    } finally {
      setDangLuu(false);
    }
  };

  const boSua = () => {
    setSua(new Map());
    setDangChonO(null);
    toast('Đã bỏ các thay đổi chưa lưu');
  };

  // Cảnh báo khi rời trang mà còn bản nháp.
  useEffect(() => {
    if (sua.size === 0) return;
    const chan = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', chan);
    return () => window.removeEventListener('beforeunload', chan);
  }, [sua.size]);

  const cuon = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400 && soDongHien < dongLoc.length) {
      setSoDongHien((n) => Math.min(n + BUOC_DONG, dongLoc.length));
    }
  };

  const TH = 'px-2 py-2 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Toaster position="top-right" />
      <Sidebar />

      <main className="flex-1 ml-64 flex flex-col min-w-0">
        {/* ── Đầu trang — đứng yên ── */}
        <div className="bg-white border-b border-slate-200 px-8 py-5 shrink-0">
          <div className="flex items-center gap-2 text-caption text-slate-400 mb-1">
            <span>Bước 1</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span>1a. Yêu cầu mua (PR)</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="font-medium text-slate-600">Phân bổ chế tạo</span>
          </div>

          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-h1">Phân Bổ Chế Tạo</h1>
              <p className="text-caption text-slate-500 mt-1 max-w-2xl">
                Chia vật tư trong yêu cầu mua theo hạng mục chế tạo của dự án. Mỗi ô ghi{' '}
                <b>số lượng</b>, <b>khối lượng</b> và <b>ngày cần vật tư tại công trường</b> —
                mốc ngày này là căn cứ đo tiến độ.
              </p>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-caption text-slate-500">
                Dự án
                <select
                  value={duAnId}
                  onChange={(e) => {
                    if (sua.size > 0 && !window.confirm('Còn thay đổi chưa lưu. Đổi dự án sẽ bỏ hết. Tiếp tục?')) return;
                    setDuAnId(e.target.value);
                  }}
                  className="mt-1 block w-72 rounded-lg border border-slate-300 px-3 py-2 text-body bg-white"
                >
                  {duAns.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </label>

              {sua.size > 0 && (
                <button
                  onClick={boSua}
                  disabled={dangLuu}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-body hover:border-slate-500 transition-colors disabled:opacity-50"
                >
                  Bỏ thay đổi
                </button>
              )}
              <button
                onClick={luu}
                disabled={sua.size === 0 || dangLuu}
                className="px-4 py-2 rounded-lg bg-[#1B365D] text-white text-body hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px] align-middle mr-1">
                  {dangLuu ? 'progress_activity' : 'save'}
                </span>
                {dangLuu ? 'Đang lưu…' : sua.size > 0 ? `Lưu ${sua.size} ô` : 'Lưu'}
              </button>
            </div>
          </div>

          {/* Thanh lọc + số liệu */}
          <div className="flex items-center gap-3 flex-wrap mt-4">
            <div className="relative">
              <span className="material-symbols-outlined text-[16px] absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                search
              </span>
              <input
                value={tim}
                onChange={(e) => setTim(e.target.value)}
                placeholder="Tìm mã vật tư, quy cách, số phiếu…"
                className="w-72 rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-caption"
              />
            </div>
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-caption">
              {([
                ['tat_ca', 'Tất cả'],
                ['chua', 'Chưa phân bổ'],
                ['roi', 'Đã phân bổ'],
              ] as const).map(([k, nhan]) => (
                <button
                  key={k}
                  onClick={() => setLocTrangThai(k)}
                  className={`px-3 py-1.5 transition-colors ${
                    locTrangThai === k ? 'bg-[#1B365D] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {nhan}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 text-caption text-slate-500 ml-auto">
              <span>
                <b className="text-slate-700">{dongLoc.length}</b>
                {dongLoc.length !== dongs.length && <span className="text-slate-400">/{dongs.length}</span>} vật tư
              </span>
              <span>
                <b className="text-slate-700">{hangMucs.length}</b> hạng mục
              </span>
              <span>
                <b className="text-slate-700">{thongKe.soODaPhanBo}</b> ô đã phân bổ
              </span>
              {thongKe.soQuaHan > 0 && (
                <span className="text-red-600 font-semibold">{thongKe.soQuaHan} vật tư quá hạn</span>
              )}
              {thongKe.soDongVuot > 0 && (
                <span className="text-red-600 font-semibold">{thongKe.soDongVuot} vật tư vượt trần</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Lưới ── */}
        {dangTai ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <span className="material-symbols-outlined animate-spin text-[24px] mr-2">progress_activity</span>
            Đang tải lưới…
          </div>
        ) : hangMucs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <span className="material-symbols-outlined text-[46px] text-slate-300">grid_off</span>
            <div className="text-body text-slate-600 font-medium">
              Dự án này chưa được phân bổ theo hạng mục thi công
            </div>
            <div className="text-caption text-slate-400 max-w-md">
              Lưới lấy cột từ danh mục hạng mục của dự án. Khai hạng mục trước rồi quay lại đây.
            </div>
            <Link
              href="/hang-muc-che-tao"
              className="mt-1 px-4 py-2 rounded-lg bg-[#1B365D] text-white text-body hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">category</span>
              Khai hạng mục chế tạo
            </Link>
          </div>
        ) : dongs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <span className="material-symbols-outlined text-[46px] text-slate-300">inbox</span>
            <div className="text-body text-slate-600 font-medium">
              Dự án này chưa có vật tư nào trong yêu cầu mua
            </div>
            <div className="text-caption text-slate-400 max-w-md">
              Lưới lấy dòng từ danh mục hàng hoá theo PR. Nhập PR trước rồi quay lại đây.
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto min-h-0" onScroll={cuon}>
            <table className="text-caption" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead className="sticky top-0 z-30">
                <tr>
                  <th
                    className={TH}
                    style={{ position: 'sticky', left: 0, zIndex: 2, width: W_PHIEU, minWidth: W_PHIEU, maxWidth: W_PHIEU }}
                  >
                    Phiếu
                  </th>
                  <th
                    className={TH}
                    style={{ position: 'sticky', left: W_PHIEU, zIndex: 2, width: W_MA, minWidth: W_MA, maxWidth: W_MA, borderRight: '1px solid #cbd5e1' }}
                  >
                    Mã vật tư
                  </th>
                  <th className={TH} style={{ minWidth: 150 }}>Quy cách</th>
                  <th className={TH} style={{ minWidth: 54 }}>ĐVT</th>
                  <th className={`${TH} text-right`} style={{ minWidth: 78 }}>SL yêu cầu</th>
                  <th className={`${TH} text-right`} style={{ minWidth: 82 }}>Đã phân bổ</th>
                  <th className={`${TH} text-right`} style={{ minWidth: 74, borderRight: '1px solid #cbd5e1' }}>Còn lại</th>
                  {hangMucs.map((c) => (
                    <th
                      key={c.id}
                      className={TH}
                      style={{ width: W_O, minWidth: W_O, maxWidth: W_O }}
                      title={c.name}
                    >
                      <div className="font-mono font-semibold text-[#1B365D] truncate">{c.code}</div>
                      <div className="text-slate-400 font-normal truncate">{c.name}</div>
                    </th>
                  ))}
                  <th className={TH} style={{ minWidth: 132, borderLeft: '1px solid #cbd5e1' }}>
                    Tiến độ
                  </th>
                </tr>
              </thead>

              <tbody>
                {dongHien.map((d) => {
                  const t = tongDong(d);
                  const td = tinhTienDo(t.som, d.ngayHangVe, homNay);
                  return (
                    <tr key={d.prDetailId} className="border-b border-slate-100 hover:bg-slate-50/70 group">
                      <td
                        className="px-2 py-1.5 bg-white group-hover:bg-slate-50 text-slate-500 truncate"
                        style={{ position: 'sticky', left: 0, zIndex: 1, width: W_PHIEU, minWidth: W_PHIEU, maxWidth: W_PHIEU }}
                        title={d.prRef}
                      >
                        <span className="font-mono">{d.docNo ?? d.prRef}</span>
                        {d.revNo != null && d.revNo > 0 && (
                          <span className="ml-1 text-[10px] px-1 rounded bg-amber-100 text-amber-700 font-semibold">
                            R{d.revNo}
                          </span>
                        )}
                      </td>
                      <td
                        className="px-2 py-1.5 bg-white group-hover:bg-slate-50 truncate"
                        style={{ position: 'sticky', left: W_PHIEU, zIndex: 1, width: W_MA, minWidth: W_MA, maxWidth: W_MA, borderRight: '1px solid #cbd5e1' }}
                        title={`${d.itemCode} — ${d.itemName}`}
                      >
                        <div className="font-mono font-medium text-[#1B365D] truncate">{d.itemCode}</div>
                        <div className="text-slate-400 truncate">{d.itemName}</div>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600 truncate" style={{ maxWidth: 150 }} title={d.profile ?? ''}>
                        {d.profile || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{d.uom}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                        {d.reqQty > 0 ? soVN.format(d.reqQty) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums ${t.q > 0 ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>
                        {t.q > 0 ? soVN.format(t.q) : '—'}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          t.vuot ? 'text-red-600 font-semibold' : d.reqQty > 0 ? 'text-slate-500' : 'text-slate-300'
                        }`}
                        style={{ borderRight: '1px solid #cbd5e1' }}
                        title={d.reqQty <= 0 ? 'Vật tư chưa có số lượng yêu cầu mua — không có trần để đối chiếu' : undefined}
                      >
                        {d.reqQty > 0 ? soVN.format(t.conLai) : '—'}
                      </td>

                      {hangMucs.map((c) => {
                        const o = layO(d, c.id);
                        const k = khoaO(d.prDetailId, c.id);
                        const banNhap = sua.has(k);
                        const rong = oTrong(o);
                        const dangMo = dangChonO?.dong.prDetailId === d.prDetailId && dangChonO?.cot.id === c.id;
                        const tdO = o?.ngayCan ? tinhTienDo(o.ngayCan, d.ngayHangVe, homNay) : null;
                        return (
                          <td
                            key={c.id}
                            onClick={() => moO(d, c)}
                            className={`px-2 py-1 cursor-pointer align-top border-l border-slate-100 ${
                              dangMo ? 'ring-2 ring-inset ring-[#1B365D] bg-blue-50' : banNhap ? 'bg-amber-50' : ''
                            }`}
                            style={{ width: W_O, minWidth: W_O, maxWidth: W_O }}
                          >
                            {rong ? (
                              <span className="text-slate-200 group-hover:text-slate-400">+</span>
                            ) : (
                              <div className="leading-tight">
                                <div className="tabular-nums font-medium text-slate-800">
                                  {soVN.format(o!.qty)} <span className="text-slate-400 font-normal">{d.uom}</span>
                                </div>
                                {o!.weight > 0 && (
                                  <div className="tabular-nums text-slate-500">{soVN.format(o!.weight)} kg</div>
                                )}
                                {o!.ngayCan && (
                                  <div className={`tabular-nums ${tdO?.mau ?? 'text-slate-500'}`} title={tdO?.chu}>
                                    {ngayNgan(o!.ngayCan)}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      <td className="px-2 py-1.5" style={{ borderLeft: '1px solid #cbd5e1', minWidth: 132 }}>
                        {td ? (
                          <>
                            <div className={`${td.mau} leading-tight`}>{td.chu}</div>
                            <div className="text-slate-400 leading-tight">
                              cần {ngayVN(t.som)}
                              {d.ngayHangVe ? ` · về ${ngayVN(d.ngayHangVe)}` : ''}
                            </div>
                          </>
                        ) : t.som ? (
                          <div className="text-slate-400">cần {ngayVN(t.som)}</div>
                        ) : (
                          <span className="text-slate-300">chưa đặt ngày</span>
                        )}
                        {!d.ngayHangVe && d.soDongHD > 0 && (
                          <div className="text-slate-300 leading-tight">
                            hàng về {d.soDongDaVe}/{d.soDongHD} dòng HĐ
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <td colSpan={8 + hangMucs.length} className="px-3 py-2 text-slate-400 bg-slate-50 border-t border-slate-200">
                    <span className="sticky left-0 inline-block">
                      Đang hiện {dongHien.length} / {dongLoc.length} vật tư
                      {soDongHien < dongLoc.length && ' — cuộn xuống để xem tiếp'}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Khay sửa ô — nằm dưới đáy, không bị khung cuộn của bảng cắt mất ── */}
        {dangChonO && (
          <div className="shrink-0 border-t-2 border-[#1B365D] bg-white px-8 py-4">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="text-caption text-slate-400">Vật tư</div>
                <div className="text-body font-mono font-medium text-[#1B365D] truncate max-w-xs">
                  {dangChonO.dong.itemCode}
                </div>
                <div className="text-caption text-slate-500 truncate max-w-xs">
                  {dangChonO.dong.itemName}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-caption text-slate-400">Hạng mục</div>
                <div className="text-body font-mono font-medium text-slate-700 truncate max-w-xs">
                  {dangChonO.cot.code}
                </div>
                <div className="text-caption text-slate-500 truncate max-w-xs">{dangChonO.cot.name}</div>
              </div>

              <label className="text-caption text-slate-500">
                Số lượng ({dangChonO.dong.uom})
                <input
                  ref={oNhapDauRef}
                  value={nhap.qty}
                  onChange={(e) => setNhap({ ...nhap, qty: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') apDungO();
                    if (e.key === 'Escape') dongO();
                  }}
                  inputMode="decimal"
                  className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 text-body tabular-nums"
                />
              </label>
              <label className="text-caption text-slate-500">
                Khối lượng (kg)
                <input
                  value={nhap.weight}
                  onChange={(e) => setNhap({ ...nhap, weight: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') apDungO();
                    if (e.key === 'Escape') dongO();
                  }}
                  inputMode="decimal"
                  className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 text-body tabular-nums"
                />
              </label>
              <label className="text-caption text-slate-500">
                Ngày cần tại công trường
                <input
                  type="date"
                  value={nhap.ngayCan}
                  onChange={(e) => setNhap({ ...nhap, ngayCan: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') apDungO();
                    if (e.key === 'Escape') dongO();
                  }}
                  className="mt-1 block w-44 rounded-lg border border-slate-300 px-3 py-2 text-body"
                />
              </label>

              <div className="flex items-center gap-2 ml-auto">
                <button onClick={xoaO} className="px-3 py-2 rounded-lg border border-slate-300 text-body text-slate-500 hover:text-red-600 hover:border-red-300">
                  Xoá ô
                </button>
                <button onClick={dongO} className="px-3 py-2 rounded-lg border border-slate-300 text-body hover:border-slate-500">
                  Đóng
                </button>
                <button onClick={apDungO} className="px-4 py-2 rounded-lg bg-[#1B365D] text-white text-body hover:opacity-90">
                  Áp dụng
                </button>
              </div>
            </div>

            <div className="text-caption text-slate-400 mt-2">
              {(() => {
                const t = tongDong(dangChonO.dong);
                if (dangChonO.dong.reqQty <= 0)
                  return 'Vật tư này chưa có số lượng yêu cầu mua — không có trần để đối chiếu.';
                return `Yêu cầu mua ${soVN.format(dangChonO.dong.reqQty)} ${dangChonO.dong.uom} · đã phân bổ ${soVN.format(
                  t.q
                )} · còn ${soVN.format(t.conLai)}. Enter để áp dụng, Esc để đóng. Thay đổi chỉ vào cơ sở dữ liệu khi bấm Lưu.`;
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
