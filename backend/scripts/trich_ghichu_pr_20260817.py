# -*- coding: utf-8 -*-
"""Trích cột 'Remarks/ Ghi chú' từ hai file PR gốc còn sót dấu 'Imported from'.

46 dòng này do import_pr_mto_from_packages.py nạp; script đó ghi đè remarks bằng
chuỗi cứng tên file, làm mất ghi chú thật. Nguồn của chúng là biểu mẫu PR (không
phải file theo dõi), nên phải trích riêng.

Xuất: scripts/trich_ghichu_pr.json  -> {prRef: {itemCode: ghiChu}}
"""
import os, re, json, glob, unicodedata, openpyxl
nfc = lambda s: unicodedata.normalize('NFC', str(s)) if s is not None else ''
BASE = '/Users/trinhhuuhung/Library/CloudStorage/SynologyDrive-IBSHI/17.DUC'

# prRef trong CSDL  ->  (mảnh tên file, tiền tố mã vật tư mà trình nạp MTO đã sinh)
CAN = {
    'I-071-ENG-001-REV 01': ('I-071-ENG-001-REV 01', '071-'),
    '23-VISC-I-063-REV01':  ('23-VISC-I-063-Rev.01', 'VISC-'),
}

def tim(manh):
    for d in os.listdir(BASE):
        p = os.path.join(BASE, d)
        if not os.path.isdir(p): continue
        for sub in glob.glob(os.path.join(p, '*', '*.xls*')):
            b = nfc(os.path.basename(sub))
            if b.startswith('~$'): continue
            if manh in b: return sub
    return None

ra = {}
for pref, (manh, tien) in CAN.items():
    f = tim(manh)
    if not f:
        print(f"  {pref:24} KHÔNG tìm thấy file nguồn"); continue
    ws = openpyxl.load_workbook(f, data_only=True, read_only=True).worksheets[0]
    hrow = rmcol = None
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=14, values_only=True), 1):
        for j, cv in enumerate(row):
            if cv and re.search(r'^remarks?\s*/\s*ghi ch', nfc(cv).strip(), re.I):
                hrow, rmcol = i, j; break
        if rmcol is not None: break
    if rmcol is None:
        print(f"  {pref:24} file KHÔNG có cột ghi chú"); continue
    gc, sec = {}, 'A'
    for row in ws.iter_rows(min_row=hrow + 1, values_only=True):
        if not row: continue
        stt = nfc(row[0]).strip() if row[0] is not None else ''
        m = re.fullmatch(r'([A-G])\s*[-.]?\s*(\d+[A-Z]?)', stt)
        if re.fullmatch(r'([A-G])\.?', stt): sec = stt[0]; continue
        if not m:
            if re.fullmatch(r'\d+', stt): m2 = (sec, stt)
            else: continue
        else: m2 = (m.group(1), m.group(2))
        # Dòng đánh số cột (1,2,3…,18) cũng khớp mẫu '^\d+$' ở cột STT và sẽ kéo theo
        # số thứ tự của chính cột ghi chú làm 'ghi chú'. Dòng vật tư thật LUÔN có mô tả.
        mota = nfc(row[1]).strip() if len(row) > 1 and row[1] is not None else ''
        if not mota: continue
        v = nfc(row[rmcol]).strip() if rmcol < len(row) and row[rmcol] is not None else ''
        if v in ('', '.', '0') or re.fullmatch(r'\d+(\.\d+)?', v): continue
        gc[f'{tien}{m2[0]}-{m2[1]}'.upper()] = v
    ra[pref] = gc
    print(f"  {pref:24} {len(gc):>4} ghi chú  (cột {rmcol}, file {nfc(os.path.basename(f))})")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trich_ghichu_pr.json')
json.dump(ra, open(out, 'w'), ensure_ascii=False)
print(f"\n  TỔNG: {sum(len(v) for v in ra.values())} ghi chú")
