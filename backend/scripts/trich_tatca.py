# -*- coding: utf-8 -*-
"""Trích bảng vật tư của MỌI dự án từ kho theo dõi của anh Đức.
Dò cột theo TÊN tiêu đề. Chuẩn hoá Unicode NFC. Loại dòng tổng và tiêu đề nhóm."""
import os, re, json, unicodedata, openpyxl, sys
def nfc(s): return unicodedata.normalize('NFC', str(s)) if s is not None else ''
GOC='/Users/trinhhuuhung/Desktop/HUNGAI/HUNGTH OBSIDIAN V/HUNGTH OBSIDIAN/IBSHI/mua-hang/00.DATA/10 TH-MUA SẮM CÁC GÓI'
MOC=('item/','description','profile','grade','unit/','u.weight','net quantity')

TRUONG={
 'itemCode':[r'item/\s*stt'], 'itemName':[r'description'], 'profile':[r'^profile'], 'grade':[r'^grade'],
 'uom':[r'unit/'], 'unitWeight':[r'u\.weight'],
 'netQty':[r'net quantity', r'q\.ty'], 'netWeight':[r'net quantity', r'weight/'],
 'ordQty':[r'total ordered', r'q\.ty'], 'ordWeight':[r'total ordered', r'weight/'],
 'remainQty':[r'tận dụng tồn kho', r'q\.ty'], 'remainWeight':[r'tận dụng tồn kho', r'weight/'],
 'toBuyQty':[r'phải mua sắm', r'q\.ty'], 'toBuyWeight':[r'phải mua sắm', r'weight/'],
 'ngayBanGiao':[r'ngày bàn giao vật tư'],
 'dnSoHD':[r'trong nước', r'số hợp đồng'], 'dnNCC':[r'trong nước', r'nhà cung cấp'],
 'dnProfile':[r'trong nước', r'profile'], 'dnGrade':[r'trong nước', r'grade'],
 'dnWeight':[r'trong nước', r'contract weight'], 'dnNgayKy':[r'trong nước', r'ngày ký'],
 'dnGiaoQty':[r'trong nước', r"handover q'ty"], 'dnGiaoWeight':[r'trong nước', r'handover weight'],
 'dnDonGia':[r'trong nước', r'đơn giá'], 'dnTongVAT':[r'trong nước', r'tổng tiền bao gồm'],
 'dnTongChuaVAT':[r'trong nước', r'chưa vat'], 'dnBanGiaoSX':[r'trong nước', r'bàn giao sản xuất'],
 'qcReport':[r'qc nghiệm thu', r'report no'], 'qcDate':[r'qc nghiệm thu', r'inspection date'],
 'qcWeight':[r'qc nghiệm thu', r'nghiệm thu đạt'],
 'nkSoHD':[r'nước ngoài', r'số hợp đồng'], 'nkNCC':[r'nước ngoài', r'nhà cung cấp'],
 'nkProfile':[r'nước ngoài', r'profile'], 'nkGrade':[r'nước ngoài', r'grade'],
 'nkWeight':[r'nước ngoài', r'weight/ khối lượng'], 'nkNgayKy':[r'nước ngoài', r'ngày ký'],
 'nkGiaoQty':[r'nước ngoài', r"handover q'ty"], 'nkGiaoWeight':[r'nước ngoài', r'khối lượng giao'],
 'nkDonGia':[r'nước ngoài', r'đơn giá'], 'nkThanhTien':[r'nước ngoài', r'thành tiền'],
 'nkLC':[r'nước ngoài', r'ngày mở l/c'], 'nkCangXuat':[r'nước ngoài', r'export port'],
 'nkCIF':[r'nước ngoài', r'cif'], 'nkThanhToan':[r'nước ngoài', r'payment date'],
 'nkHaiQuan':[r'nước ngoài', r'hải quan'], 'nkHangVe':[r'nước ngoài', r'ngày hàng về'],
 'nkMoiNT':[r'nước ngoài', r'mời nghiệm thu'], 'nkBanGiaoSX':[r'nước ngoài', r'bàn giao sản xuất'],
}

def moiNhat():
    m={}
    for r,d,fs in os.walk(GOC):
        for f in fs:
            if not f.lower().endswith(('.xlsx','.xls')) or f.startswith('~$'): continue
            g=re.match(r'(\d{4})[ .](\d{2})[ .](\d{2})\s*Theo dõi dự án\s+(.+?)_Rev', nfc(f), re.I)
            if not g: continue
            ng=''.join(g.group(1,2,3)); da=g.group(4).strip()
            if da not in m or ng>m[da][0]: m[da]=(ng, os.path.join(r,f))
    return m

def trich(duong):
    """Chấm điểm MỌI sheet rồi lấy sheet tốt nhất — sheet phụ như
    'Vat lieu han -BRA090' cũng khớp vài từ khoá nên lấy sheet đầu tiên là sai."""
    wb=openpyxl.load_workbook(duong, data_only=True)
    ung=[]
    for ten in wb.sheetnames:
        ws=wb[ten]
        og={}
        for rg in ws.merged_cells.ranges:
            v=ws.cell(rg.min_row,rg.min_col).value
            for rr in range(rg.min_row,rg.max_row+1):
                for cc in range(rg.min_col,rg.max_col+1): og[(rr,cc)]=v
        # BUỘC gắn og/ws của ĐÚNG vòng lặp này. Không có default arg thì lambda
        # tham chiếu biến vòng lặp, sau khi thoát vòng sẽ đọc nhầm sheet cuối cùng.
        o=lambda r,c,_og=og,_ws=ws: _og.get((r,c), _ws.cell(r,c).value)
        hrow=None
        for i in range(1, min(12, ws.max_row)+1):
            cells=' | '.join(nfc(o(i,c)).lower() for c in range(1, min(ws.max_column,200)+1) if o(i,c))
            if sum(1 for k in MOC if k in cells)>=4: hrow=i; break
        if hrow is None: continue
        def th(c):
            p=[nfc(o(r,c)).replace('\n',' ').strip() for r in (hrow,hrow+1) if o(r,c) is not None]
            return ' / '.join(dict.fromkeys(p)).lower()
        cot={}
        for k,pats in TRUONG.items():
            for c in range(1, ws.max_column+1):
                h=th(c)
                if h and all(re.search(p,h) for p in pats): cot[k]=c; break
        if 'itemCode' not in cot: continue
        ung.append((len(cot), ws.max_row, ten, hrow, cot, o, ws))
    if not ung:
        wb.close(); return None
    ung.sort(key=lambda x: (x[0], x[1]), reverse=True)   # nhiều cột nhất, rồi nhiều dòng nhất
    _,_,ten,hrow,cot,o,ws = ung[0]
    def th2(c):
        p=[nfc(o(r,c)).replace('\n',' ').strip() for r in (hrow,hrow+1) if o(r,c) is not None]
        return ' / '.join(dict.fromkeys(p)).lower()
    dt=[]
    for c in range(1, ws.max_column+1):
        g=re.search(r'dự trù lần (\d+)\s*\(ngày\s*([\d/]+)\)', th2(c))
        if g and 'q.ty' in th2(c): dt.append({'lan':int(g.group(1)),'ngay':g.group(2)})
    rows=[]
    for r in range(hrow+1, ws.max_row+1):
        ma=nfc(o(r,cot['itemCode'])).strip()
        if not ma: continue
        # dòng đánh số cột (1,2,3…) — mã là số nguyên nhỏ
        if re.fullmatch(r'\d{1,3}(\.0)?', ma): continue
        # dòng tiêu đề phụ lọt xuống (tiêu đề trải 2 dòng, hrow+1 vẫn là tiêu đề)
        if re.search(r'item\s*/|^stt$|^no\.?$', ma, re.I): continue
        d={k:o(r,c) for k,c in cot.items()}
        # Tiêu đề nhóm (VTC01, VPK…): mã KHÔNG có gạch nối và KHÔNG có đơn vị tính.
        # Không xét quy cách — ô đó ở dòng nhóm chứa tên nhóm ('Main-Material…').
        if '-' not in ma and not nfc(d.get('uom')).strip(): continue
        d['_dong']=r
        rows.append(d)
    wb.close()
    return {'sheet':nfc(ten),'hrow':hrow,'soCot':ws.max_column,'soCotDo':len(cot),
            'thieuCot':[k for k in TRUONG if k not in cot],'soLanDuTru':len(dt),'rows':rows}

if __name__=='__main__':
    m=moiNhat(); ra={}
    for da,(ng,f) in sorted(m.items()):
        try: kq=trich(f)
        except Exception as e:
            print(f"  {da:12} LỖI: {e}"); continue
        if not kq: print(f"  {da:12} KHÔNG thấy bảng vật tư"); continue
        ra[da]={'ngay':ng,'file':nfc(f),**kq}
        print(f"  {da:12} {kq['sheet'][:24]:24} {len(kq['rows']):>5} dòng · {kq['soCotDo']}/{len(TRUONG)} cột · {kq['soLanDuTru']} lần dự trù")
    json.dump(ra, open('trich_tatca.json','w'), ensure_ascii=False, default=str)
    print(f"\n  TỔNG: {len(ra)} dự án · {sum(len(v['rows']) for v in ra.values())} dòng vật tư")
