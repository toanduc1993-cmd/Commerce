import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';

export const metadata: Metadata = {
  title: 'IBSHI_COMMERCIAL_MATERIAL_TRACKING',
  description: 'Hệ thống theo dõi mua sắm vật tư thương mại — IBS Heavy Industry',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="light">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700;800&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#f8f9ff] text-[#0b1c30] font-['Inter']">
        <Toaster position="top-right" />
        {/* S1-4 + UI-1-3: ErrorBoundary wraps + Workspace context shared */}
        <ErrorBoundary scope="root">
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </ErrorBoundary>
        {/* UI-4-3: Global ?-shortcut cheatsheet — mount ngoài ErrorBoundary để luôn dùng được */}
        <KeyboardShortcutsModal />
      </body>
    </html>
  );
}
