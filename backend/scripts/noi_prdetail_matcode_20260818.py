# -*- coding: utf-8 -*-
"""Nối PrDetail sang sổ mã vật tư anh Huyến ("MatCode") bằng chữ ký kích thước.

Vì sao cần: mã dòng PR ('071-A-1') và mã kho ('BAH.AOBH.001') là hai hệ khác hẳn.
Trước khi có cầu nối, bước 1b so thẳng hai cột itemCode nên chỉ khớp 7/6.052 dòng.

Cách nối — theo đúng chỉ dẫn phòng TM ("tạm nối bằng spec, nhưng phải giữ cờ
'nối máy, chưa duyệt'"):
  khoá = (phần chữ đầu của tên, bỏ dấu, viết hoa)  +  (dãy số trong quy cách)
  PR : 'Thép tròn' + 'RB20-L6000'                  -> ('THEPTRON', ('20','6000'))
  KHO: 'Thép tròn 20x6000'                         -> ('THEPTRON', ('20','6000'))

CHỈ NHẬN khi một khoá ra ĐÚNG MỘT mã kho. Khoá ra nhiều mã thì BỎ và liệt kê —
đoán bừa một mã sẽ khiến bước 1b trừ nhầm tồn kho của vật tư khác.

Mọi dòng nối được đều mang cờ matCodeSource='NOI_MAY_CHUA_DUYET'. Khi phòng TM giao
bảng nối chính thức thì ghi đè bằng 'PHONG_TM_DUYET'.

Chạy: python3 noi_prdetail_matcode_20260818.py [--ghi]
"""
import sys, re, unicodedata, collections, psycopg2

GHI = '--ghi' in sys.argv
DSN = 'postgresql://vpi_user:VpiProcurement2026!@127.0.0.1:54321/vpi_procurement'

def bo_dau(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('đ', 'd').replace('Đ', 'D')

def goc(s):
    return re.sub(r'[^A-Z]', '', bo_dau(s).upper())

def kich_thuoc(s):
    # số nguyên hoá để '10.0' và '10' cùng khoá; giữ THỨ TỰ vì 10x2000x6000 khác 2000x10x6000
    return tuple(str(int(float(x))) for x in re.findall(r'\d+(?:\.\d+)?', str(s or '')))

print('⚠  GHI THẬT\n' if GHI else '○  CHẠY THỬ — không ghi gì. Thêm --ghi để ghi thật.\n')

cn = psycopg2.connect(DSN); cn.set_client_encoding('UTF8'); cur = cn.cursor()

cur.execute('SELECT "matCode", name FROM "MatCode"')
kho = collections.defaultdict(list)
for ma, ten in cur.fetchall():
    m = re.match(r'^([^0-9]+)', ten or '')
    kho[(goc(m.group(1)) if m else '', kich_thuoc(ten))].append(ma)

cur.execute('SELECT id, "itemName", profile FROM "PrDetail"')
pr = cur.fetchall()

noi, nhap_nhang, khong = [], collections.Counter(), 0
for pid, ten, prof in pr:
    c = kho.get((goc(ten), kich_thuoc(prof)))
    if not c: khong += 1; continue
    if len(c) > 1: nhap_nhang[(goc(ten), kich_thuoc(prof))] = len(c); continue
    noi.append((c[0], pid))

print(f'  PrDetail {len(pr)} dòng')
print(f'    nối được 1-1 : {len(noi)}')
print(f'    nhập nhằng   : {sum(nhap_nhang.values())} dòng trên {len(nhap_nhang)} khoá — BỎ, không đoán')
print(f'    không tìm thấy: {khong}')

if GHI:
    cur.execute('DROP TABLE IF EXISTS "_backup_PrDetail_matcode_20260818"')
    cur.execute('CREATE TABLE "_backup_PrDetail_matcode_20260818" AS '
                'SELECT id, "itemCode", "matCode", "matCodeSource" FROM "PrDetail"')
    # chỉ ghi lên dòng CHƯA có mã, hoặc dòng đang mang mã do máy nối (không đè mã phòng TM duyệt)
    cur.executemany(
        'UPDATE "PrDetail" SET "matCode"=%s, "matCodeSource"=\'NOI_MAY_CHUA_DUYET\', "updatedAt"=now() '
        'WHERE id=%s AND ("matCodeSource" IS NULL OR "matCodeSource"=\'NOI_MAY_CHUA_DUYET\')', noi)
    cn.commit()

cur.execute('SELECT count("matCode"), count(*) FROM "PrDetail"')
a, b = cur.fetchone()
cur.execute('SELECT count(*) FROM "PrDetail" d JOIN "Inventory" i ON i."itemCode"=d."matCode"')
ton = cur.fetchone()[0]
print(f'\n  PrDetail có mã vật tư: {a}/{b}')
print(f'  Bước 1b nay đối chiếu được tồn kho cho: {ton} dòng (trước đây 7)')
cn.close()
