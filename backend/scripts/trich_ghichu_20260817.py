# -*- coding: utf-8 -*-
"""Trích RIÊNG cột ghi chú của mọi dự án trong kho theo dõi.

Vì sao tách khỏi trich_tatca.py: file trich_tatca.json đang được dùng làm đầu vào
cho các trình nạp khác; sinh đè lên nó sẽ kéo theo mọi trường số vào một đợt nạp
lẽ ra chỉ chạm đúng một cột. Ở đây chỉ xuất {dự án: {mã vật tư: ghi chú}}.

Xuất: scripts/trich_ghichu.json
"""
import json, sys, os, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trich_tatca as T

def nfc(s): return unicodedata.normalize('NFC', str(s)) if s is not None else ''

if 'remarks' not in T.TRUONG:
    sys.exit('DỪNG: trich_tatca.py chưa khai báo cột remarks')

m = T.moiNhat()
ra, thieu = {}, []
for da, (ng, f) in sorted(m.items()):
    try:
        kq = T.trich(f)
    except Exception as e:
        print(f"  {da:12} LỖI: {e}"); continue
    if not kq:
        print(f"  {da:12} KHÔNG thấy bảng vật tư"); continue
    if 'remarks' in kq['thieuCot']:
        thieu.append(da)
        print(f"  {da:12} — file KHÔNG có cột ghi chú")
        continue
    gc = {}
    for r in kq['rows']:
        ma = nfc(r.get('itemCode')).strip().upper()
        v  = nfc(r.get('remarks')).strip()
        # '.' và '0' là ô đánh dấu trong biểu mẫu, không phải ghi chú
        if not ma or v in ('', '.', '0', 'None'): continue
        gc.setdefault(ma, v)
    ra[da] = {'ngay': ng, 'file': nfc(f), 'ghiChu': gc}
    print(f"  {da:12} {len(gc):>5} ghi chú / {len(kq['rows']):>5} dòng")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trich_ghichu.json')
json.dump(ra, open(out, 'w'), ensure_ascii=False, default=str)
print(f"\n  TỔNG: {len(ra)} dự án có cột ghi chú · "
      f"{sum(len(v['ghiChu']) for v in ra.values())} ghi chú")
print(f"  {len(thieu)} dự án KHÔNG có cột ghi chú: {', '.join(thieu) if thieu else '—'}")
