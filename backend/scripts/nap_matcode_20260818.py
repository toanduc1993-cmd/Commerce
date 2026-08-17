# -*- coding: utf-8 -*-
"""Nạp mat_code_xref_FINAL.csv (9.653 mã) vào bảng tra cứu "MatCode".

LOẠI RA (lệnh anh Hưng 18/08: "phần nào thiếu thông tin em loại ra"):
  - mã không có tên ở CẢ name_kho lẫn name_ketoan → không tra cứu được, vô dụng
  - mã trùng nhau sau khi chuẩn hoá hoa thường (giữ dòng đầu)

KHÔNG hợp nhất 5 cặp mã trùng spec — giữ cả hai, đúng luật số 4. (Đo thật: 3/10 mã trong
danh sách chờ hợp nhất KHÔNG tồn tại trong 9.653 mã; đã ghi vào danh sách trả về phòng TM.)

Chạy: python3 nap_matcode_20260818.py [--ghi]
"""
import csv, io, sys, os, psycopg2

GHI = '--ghi' in sys.argv
NGUON = ('/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI'
         '/mua-hang/04.DATA-CHUAN-SCMS/mat_code_xref_FINAL.csv')
DSN = 'postgresql://vpi_user:VpiProcurement2026!@127.0.0.1:54321/vpi_procurement'

def chu(v):
    s = str(v or '').strip()
    return None if s in ('', 'nan', 'None') else s

def so(v):
    s = str(v or '').strip().replace(',', '')
    if s in ('', 'nan', 'None'): return None
    try: return float(s)
    except ValueError: return None

def co(v):  # cột đánh dấu kiểu 'Y'
    return str(v or '').strip().upper() in ('Y', 'YES', 'TRUE', '1', 'X')

print('⚠  GHI THẬT\n' if GHI else '○  CHẠY THỬ — không ghi gì. Thêm --ghi để ghi thật.\n')

rows = list(csv.DictReader(io.open(NGUON, encoding='utf-8-sig')))
print(f'  đọc {len(rows)} dòng')

daCo, sach, loai = set(), [], {'khong_ten': 0, 'trung_ma': 0}
for r in rows:
    ma = chu(r.get('mat_code'))
    if not ma: loai['khong_ten'] += 1; continue
    k = ma.upper()
    if k in daCo: loai['trung_ma'] += 1; continue
    ten = chu(r.get('name_kho')) or chu(r.get('name_ketoan'))
    if not ten: loai['khong_ten'] += 1; continue
    daCo.add(k)
    sach.append((ma, chu(r.get('prefix')), ten, chu(r.get('name_ketoan')),
                 chu(r.get('unit')) or chu(r.get('unit_ketoan')), chu(r.get('mapping_status')),
                 co(r.get('in_kho_31_3_2026')), so(r.get('sl_ton_total')),
                 so(r.get('gt_ton_vnd')), so(r.get('unit_price_avg')), chu(r.get('kho_list'))))

print(f'  dùng được {len(sach)} · loại {loai["khong_ten"]} không tên · {loai["trung_ma"]} trùng mã')
tt = {}
for s in sach: tt[s[5] or '(trống)'] = tt.get(s[5] or '(trống)', 0) + 1
print('  theo mapping_status: ' + ' · '.join(f'{k} {v}' for k, v in sorted(tt.items(), key=lambda x: -x[1])))

# client_encoding: tên vật tư có dấu tiếng Việt; không đặt thì psycopg2 lấy mã hoá
# mặc định của môi trường (ascii ở đây) và ném UnicodeEncodeError ngay ký tự có dấu đầu tiên.
cn = psycopg2.connect(DSN); cn.set_client_encoding('UTF8'); cur = cn.cursor()
if GHI:
    cur.executemany(
        'INSERT INTO "MatCode" ("matCode","prefix","name","nameKetoan","uom","mappingStatus",'
        '"inKho","onHandQty","onHandValue","unitPriceAvg","khoList") '
        'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT ("matCode") DO NOTHING', sach)
    cn.commit()

cur.execute('SELECT count(*), count(*) FILTER (WHERE "inKho"), count("unitPriceAvg") FROM "MatCode"')
t, k, g = cur.fetchone()
cur.execute('SELECT count(*) FROM "Inventory" i JOIN "MatCode" m ON m."matCode" = i."itemCode"')
noi = cur.fetchone()[0]
cur.execute('SELECT count(*) FROM "Inventory"')
tong_inv = cur.fetchone()[0]
print(f'\n  MatCode: {t} mã · trong kho {k} · có đơn giá bình quân {g}')
print(f'  Inventory nối được sang MatCode: {noi}/{tong_inv}')
cn.close()
