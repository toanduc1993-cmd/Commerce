# -*- coding: utf-8 -*-
"""Trích bảng vật tư dự án 095 từ file theo dõi của anh Đức.
Dò cột theo TÊN TIÊU ĐỀ, không theo vị trí — vị trí đổi theo từng dự án."""
import os, re, json, unicodedata, openpyxl
def nfc(s): return unicodedata.normalize('NFC', str(s))

GOC='/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/00.DATA/10 TH-MUA SẮM CÁC GÓI'
def tim(pre):
    for r,d,fs in os.walk(GOC):
        for x in fs:
            if nfc(x).startswith(pre) and not x.startswith('~$'): return os.path.join(r,x)
F=tim('2026 08 07 Theo dõi dự án 095_Rev')
wb=openpyxl.load_workbook(F,data_only=True); ws=wb['25-VPI-I-095']

# trải ô gộp để đọc được tiêu đề nhóm
og={}
for rg in ws.merged_cells.ranges:
    v=ws.cell(rg.min_row,rg.min_col).value
    for rr in range(rg.min_row,rg.max_row+1):
        for cc in range(rg.min_col,rg.max_col+1): og[(rr,cc)]=v
def o(r,c): return og.get((r,c), ws.cell(r,c).value)
def th(c):
    p=[nfc(o(r,c)).replace('\n',' ').strip() for r in (4,5) if o(r,c) is not None]
    return ' / '.join(dict.fromkeys(p)).lower()

def cot(*pats, sau=0):
    """cột đầu tiên khớp mọi mẫu, tính từ cột `sau`"""
    for c in range(sau+1, ws.max_column+1):
        h=th(c)
        if all(re.search(p,h) for p in pats): return c
    return None

M={
 'itemCode':cot(r'item/\s*stt'), 'itemName':cot(r'description'), 'profile':cot(r'profile'),
 'grade':cot(r'grade'), 'uom':cot(r'unit/'), 'unitWeight':cot(r'u\.weight'),
 'netQty':cot(r'net quantity', r'q\.ty'), 'netWeight':cot(r'net quantity', r'weight/'),
 'ordQty':cot(r'total ordered', r'q\.ty'), 'ordWeight':cot(r'total ordered', r'weight/'),
 'remainQty':cot(r'tận dụng tồn kho', r'q\.ty'), 'remainWeight':cot(r'tận dụng tồn kho', r'weight/'),
 'toBuyQty':cot(r'phải mua sắm', r'q\.ty'), 'toBuyWeight':cot(r'phải mua sắm', r'weight/'),
 'ngayBanGiao':cot(r'ngày bàn giao vật tư'),
 'dnSoHD':cot(r'trong nước', r'số hợp đồng'), 'dnNCC':cot(r'trong nước', r'nhà cung cấp'),
 'dnProfile':cot(r'trong nước', r'profile'), 'dnGrade':cot(r'trong nước', r'grade'),
 'dnWeight':cot(r'trong nước', r'contract weight'), 'dnNgayKy':cot(r'trong nước', r'ngày ký'),
 'dnGiaoQty':cot(r'trong nước', r"handover q'ty"), 'dnGiaoWeight':cot(r'trong nước', r'handover weight'),
 'dnDonGia':cot(r'trong nước', r'đơn giá'), 'dnTongVAT':cot(r'trong nước', r'tổng tiền bao gồm'),
 'dnTongChuaVAT':cot(r'trong nước', r'chưa vat'), 'dnBanGiaoSX':cot(r'trong nước', r'bàn giao sản xuất'),
 'qcReport':cot(r'qc nghiệm thu', r'report no'), 'qcDate':cot(r'qc nghiệm thu', r'inspection date'),
 'qcWeight':cot(r'qc nghiệm thu', r'nghiệm thu đạt'), 'qcResult':cot(r'qc nghiệm thu', r'results'),
 'nkSoHD':cot(r'nước ngoài', r'số hợp đồng'), 'nkNCC':cot(r'nước ngoài', r'nhà cung cấp'),
 'nkWeight':cot(r'nước ngoài', r'weight/ khối lượng'), 'nkNgayKy':cot(r'nước ngoài', r'ngày ký'),
 'nkDonGia':cot(r'nước ngoài', r'đơn giá'), 'nkThanhTien':cot(r'nước ngoài', r'thành tiền'),
 'nkLC':cot(r'nước ngoài', r'ngày mở l/c'), 'nkCangXuat':cot(r'nước ngoài', r'export port'),
 'nkCIF':cot(r'nước ngoài', r'cif'), 'nkThanhToan':cot(r'nước ngoài', r'payment date'),
 'nkHaiQuan':cot(r'nước ngoài', r'hải quan'), 'nkHangVe':cot(r'nước ngoài', r'ngày hàng về'),
 'nkMoiNT':cot(r'nước ngoài', r'mời nghiệm thu'), 'nkBanGiaoSX':cot(r'nước ngoài', r'bàn giao sản xuất'),
 'daMuaQty':cot(r'tổng đã mua', r'q\.ty'), 'daMuaWeight':cot(r'tổng đã mua', r'weight/'),
 'danhGia':cot(r'so sánh với số lượng', r'đánh giá'),
}
# các lần dự trù
DT=[]
for c in range(1, ws.max_column+1):
    m=re.search(r'dự trù lần (\d+)\s*\(ngày\s*([\d/]+)\)', th(c))
    if m and 'q.ty' in th(c): DT.append({'lan':int(m.group(1)),'ngay':m.group(2),'cotQty':c,'cotWeight':c+1})

rows=[]
for r in range(7, ws.max_row+1):
    ma=o(r, M['itemCode'])
    if ma in (None,'') or not str(ma).strip(): continue
    d={k:(o(r,c) if c else None) for k,c in M.items()}
    d['_dong']=r
    d['duTru']=[{'lan':x['lan'],'ngay':x['ngay'],'qty':o(r,x['cotQty']),'weight':o(r,x['cotWeight'])} for x in DT]
    rows.append(d)

print(f"TỆP  : {nfc(os.path.basename(F))}")
print(f"SHEET: 25-VPI-I-095 · {ws.max_row} dòng × {ws.max_column} cột")
print(f"CỘT DÒ ĐƯỢC: {sum(1 for v in M.values() if v)}/{len(M)}")
thieu=[k for k,v in M.items() if not v]
if thieu: print(f"KHÔNG dò được: {thieu}")
print(f"SỐ LẦN DỰ TRÙ: {len(DT)}  ({DT[0]['ngay']} → {DT[-1]['ngay']})")
print(f"DÒNG VẬT TƯ  : {len(rows)}")
json.dump(rows, open('095_trich.json','w'), ensure_ascii=False, default=str)
json.dump({'file':nfc(F),'cot':M,'duTru':DT}, open('095_bando.json','w'), ensure_ascii=False)
print("→ đã ghi 095_trich.json")
