// ============================================================
// COMPONENT: ClarificationLog.tsx
// Panel lịch sử làm rõ kỹ thuật + ô nhập phản hồi
// ============================================================

'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

interface LogEntry {
  id: number;
  author: string;
  role: 'kt' | 'mh';
  time: string;
  message: string;
}

const INITIAL_LOGS: LogEntry[] = [
  {
    id: 1,
    author: 'Kỹ sư Thiết kế (ME)',
    role: 'kt',
    time: '14:20 - 15/05',
    message: 'Yêu cầu bổ sung chứng chỉ MTR cho lô thép A516. Kiểm tra lại thông số áp suất.',
  },
  {
    id: 2,
    author: 'Mua hàng (Procurement)',
    role: 'mh',
    time: '09:15 - 16/05',
    message: 'Đã liên hệ POSCO lấy MTR. Thông số áp suất cập nhật trong Rev.02.',
  },
];

export function ClarificationLog() {
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    if (!draft.trim()) return;
    setLogs((prev) => [
      ...prev,
      {
        id: Date.now(),
        author: 'Bạn',
        role: 'mh',
        time:
          new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
          ' - ' +
          new Date().toLocaleDateString('vi-VN'),
        message: draft.trim(),
      },
    ]);
    setDraft('');
    toast.success('Đã gửi phản hồi');
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-primary text-white">
        <h3 className="font-bold flex items-center gap-2 uppercase tracking-wider text-[10px]">
          <span className="material-symbols-outlined text-sm">history</span>
          Lịch sử Làm rõ Kỹ thuật
        </h3>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[600px]">
        {logs.map((entry) => (
          <div
            key={entry.id}
            className={`relative pl-6 border-l-2 ${
              entry.role === 'kt' ? 'border-surface-container' : 'border-green-200'
            }`}
          >
            <div
              className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm ${
                entry.role === 'kt' ? 'bg-primary' : 'bg-green-500'
              }`}
            />
            <div className="mb-1 flex justify-between items-center">
              <span
                className={`text-[9px] font-black uppercase ${
                  entry.role === 'kt' ? 'text-primary' : 'text-green-700'
                }`}
              >
                {entry.author}
              </span>
              <span className="text-[9px] text-on-surface-variant">{entry.time}</span>
            </div>
            <div
              className={`p-2.5 rounded-lg text-[10px] leading-relaxed italic ${
                entry.role === 'kt'
                  ? 'bg-surface-container-low text-on-surface-variant'
                  : 'bg-green-50 text-green-900'
              }`}
            >
              &ldquo;{entry.message}&rdquo;
            </div>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-surface-container">
        <textarea
          className="w-full text-[10px] bg-surface-container-low border-0 rounded-lg p-2.5 h-20 focus:ring-1 focus:ring-primary outline-none resize-none"
          placeholder="Phản hồi kỹ thuật mới..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) handleSend();
          }}
        />
        <div className="mt-2 flex justify-between items-center">
          <button className="flex items-center text-slate-500 hover:text-primary">
            <span className="material-symbols-outlined text-xs mr-1">attach_file</span>
            <span className="text-[9px] font-bold uppercase">Đính kèm</span>
          </button>
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="bg-primary text-white px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-40 hover:bg-[#2a5298] transition-colors"
          >
            Gửi (Ctrl+Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
