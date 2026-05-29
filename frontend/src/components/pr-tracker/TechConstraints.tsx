// ============================================================
// COMPONENT: TechConstraints.tsx
// Panel hiển thị ràng buộc kỹ thuật + thông tin dự án
// ============================================================

'use client';

export function TechConstraints() {
  return (
    <div className="space-y-6">
      {/* Ràng buộc kỹ thuật */}
      <div className="bg-surface-container-highest/30 rounded-xl p-5 border border-primary/5">
        <h3 className="text-xs font-bold text-primary mb-4 uppercase tracking-widest flex items-center">
          <span className="material-symbols-outlined text-sm mr-2">rule</span>
          Ràng buộc kỹ thuật
        </h3>
        <div className="space-y-4">
          <div className="bg-error-container/20 p-3 rounded-lg border border-error/10">
            <div className="text-[10px] font-bold text-error uppercase mb-1">Hạn chế nguồn gốc</div>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              KHÔNG DÙNG VẬT LIỆU TỪ <span className="font-bold">TRUNG QUỐC HOẶC ẤN ĐỘ</span> CHO
              TẤT CẢ DÒNG ỐNG HP PIPING.
            </p>
          </div>

          <div className="bg-primary-container/10 p-3 rounded-lg border border-primary/10">
            <div className="text-[10px] font-bold text-primary uppercase mb-1">
              CE &amp; Impact Test (REV 08)
            </div>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              Carbon Equivalent &le; 0.45%. Thử nghiệm va đập tại -12°C cho kết cấu chính.
            </p>
          </div>

          <div className="bg-primary-container/5 p-3 rounded-lg">
            <div className="text-[10px] font-bold text-primary uppercase mb-1">
              Yêu cầu chứng chỉ (EN 10204 3.1)
            </div>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              Yêu cầu đầy đủ chứng chỉ EN 10204 3.1 cho các thành phần dòng PV.
            </p>
          </div>
        </div>
      </div>

      {/* Thông tin dự án */}
      <div className="bg-surface-container-low p-6 rounded-xl space-y-4 shadow-sm border border-outline-variant/10">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary border-b border-outline-variant/30 pb-2">
          Thông tin Dự án
        </h4>
        <div className="grid grid-cols-1 gap-4">
          {[
            { label: 'Mã Dự Án', value: '2024-GP-01', cls: '' },
            { label: 'Mức Độ Ưu Tiên KT', value: 'Hạng A (Nghiêm Trọng)', cls: 'text-error' },
            { label: 'Giai Đoạn', value: 'Lắp Đặt Cơ Khí', cls: '' },
          ].map((row) => (
            <div key={row.label}>
              <p className="text-[9px] font-bold text-on-surface-variant uppercase">{row.label}</p>
              <p className={`text-xs font-semibold ${row.cls}`}>{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
