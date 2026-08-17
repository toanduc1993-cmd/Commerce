# -*- coding: utf-8 -*-
"""Nạp bảng kê phiếu nhập kế toán 2022–2025 vào "AccountingInbound".

Nguồn: IBSHI/mua-hang/00.DATA/KE-TOAN/CT NK theo NCCCT VT.xlsx (Sheet1, tiêu đề dòng 7)

LOẠI RA (lệnh anh Hưng 18/08: "phần nào thiếu thông tin em loại ra"):
  - dòng không có Số ct hoặc Ngày ct  → không định danh được chứng từ
  - dòng không có Mã vật tư           → không tra cứu được, vô dụng cho mua hàng
  - dòng Số lượng = 0 hoặc trống      → không tính được đơn giá thực
  - dòng Tiền trống                   → không dùng làm thước đo giá được

Dự án và số hợp đồng lấy từ CỘT RIÊNG 'Vụ việc' và 'Hợp đồng' — KHÔNG bóc từ 'Diễn giải'
như chỉ dẫn ban đầu nói (đã kiểm: 16.988 dòng có cột riêng, Diễn giải chỉ là câu mô tả).

KHÔNG áp quy tắc biến thể mã vật tư (.01↔.001, O↔0): đo thật chỉ cứu thêm 155 mã, trong đó
chỉ 28 xác minh được bằng tên và 16 ca bắt SANG VẬT TƯ KHÁC. Giữ nguyên mã kế toán, để
matCode nào không có trong sổ thì cứ để nguyên chuỗi — tra cứu được bằng JOIN khi cần.

Chạy: python3 nap_nhap_kho_ke_toan_20260818.py [--ghi]
"""
import sys, openpyxl, psycopg2
from datetime import datetime

GHI = '--ghi' in sys.argv
NGUON = ('/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI'
         '/mua-hang/00.DATA/KE-TOAN/CT NK theo NCCCT VT.xlsx')
DSN = 'postgresql://vpi_user:VpiProcurement2026!@127.0.0.1:54321/vpi_procurement'
C = dict(ngay=1, soct=2, makhach=4, tenkhach=5, dienGiai=6, mavt=7, tenvt=8, dvt=9,
         kho=10, sl=13, gia=14, tien=15, tkco=19, vuviec=21, hopdong=22)

def chu(v):
    s = str(v).strip() if v is not None else ''
    return None if s in ('', 'None', 'nan') else s

def so(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace(',', '')
    try: return float(s)
    except ValueError: return None

print('⚠  GHI THẬT\n' if GHI else '○  CHẠY THỬ — không ghi gì. Thêm --ghi để ghi thật.\n')

ws = openpyxl.load_workbook(NGUON, data_only=True, read_only=True)['Sheet1']
doc = sach = 0
loai = {'thieu_chung_tu': 0, 'thieu_ma_vt': 0, 'sl_khong': 0, 'thieu_tien': 0}
rows, tongTien = [], 0.0
for r in ws.iter_rows(min_row=8, values_only=True):
    if not r or all(v is None for v in r): continue
    g = lambda k: r[C[k]] if C[k] < len(r) else None
    doc += 1
    soct, ngay = chu(g('soct')), g('ngay')
    if not soct or not isinstance(ngay, datetime): loai['thieu_chung_tu'] += 1; continue
    mavt = chu(g('mavt'))
    if not mavt: loai['thieu_ma_vt'] += 1; continue
    sl = so(g('sl'))
    if not sl: loai['sl_khong'] += 1; continue
    tien = so(g('tien'))
    if tien is None: loai['thieu_tien'] += 1; continue
    gia = so(g('gia'))
    if gia is None: gia = tien / sl
    sach += 1; tongTien += tien
    rows.append((soct, ngay, chu(g('makhach')), chu(g('tenkhach')), mavt, chu(g('tenvt')),
                 chu(g('dvt')), chu(g('kho')), sl, gia, tien, chu(g('tkco')),
                 chu(g('vuviec')), chu(g('hopdong')), chu(g('dienGiai'))))

print(f'  đọc {doc} dòng → dùng được {sach} · loại {sum(loai.values())}')
for k, v in loai.items():
    if v: print(f'     ✗ {k}: {v}')
print(f'  tổng tiền dòng dùng được: {tongTien:,.0f} đ')

cn = psycopg2.connect(DSN); cn.set_client_encoding('UTF8'); cur = cn.cursor()
if GHI:
    for i in range(0, len(rows), 1000):
        cur.executemany(
            'INSERT INTO "AccountingInbound" ("docNo","docDate","vendorAcctCode","vendorNameRaw",'
            '"matCode","matNameRaw","uom","warehouse","qty","unitPrice","amount","creditAcct",'
            '"projectRaw","contractRaw","note") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) '
            # ON CONFLICT phải liệt kê CỘT, không dùng ON CONSTRAINT: đây là unique INDEX chứ không
            # phải unique CONSTRAINT nên Postgres không tìm thấy tên.
            'ON CONFLICT ("docNo","docDate","matCode","qty","amount") DO NOTHING', rows[i:i+1000])
    cn.commit()
    # nối sang Vendor bằng mã kế toán của sổ mã NCC
    cur.execute('''UPDATE "AccountingInbound" a SET "vendorId" = v.id
                   FROM "Vendor" v WHERE v."accountingCode" = a."vendorAcctCode" AND a."vendorId" IS NULL''')
    cn.commit()

cur.execute('SELECT count(*), count("vendorId"), sum("amount") FROM "AccountingInbound"')
t, nv, tt = cur.fetchone()
cur.execute('SELECT count(*) FROM "AccountingInbound" a JOIN "MatCode" m ON m."matCode" = a."matCode"')
nm = cur.fetchone()[0]
cur.execute('SELECT count(*) FROM "AccountingInbound" WHERE "projectRaw" IS NOT NULL')
np = cur.fetchone()[0]
print(f'\n  AccountingInbound: {t} dòng · {tt or 0:,.0f} đ')
print(f'    nối được NCC:    {nv}/{t}')
print(f'    nối được mã vật tư sang MatCode: {nm}/{t}')
print(f'    có mã dự án:     {np}/{t}')
cn.close()
