// F-BID-B: URL redirect middleware — 4 URL cũ → 2 URL mới
// Chạy ở Edge runtime, không cần thay đổi code bất kỳ component nào.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const REDIRECTS: Record<string, string> = {
  '/yeu-cau-bao-gia': '/bao-gia?tab=requests',
  '/so-sanh-bao-gia': '/duyet?tab=compare',
  '/duyet-bao-gia': '/duyet?tab=approve',
};

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const target = REDIRECTS[pathname];
  if (target) {
    // Preserve ?bid=<id> query param if present
    const existing = new URL(request.url);
    const bidParam = existing.searchParams.get('bid');

    const redirectUrl = new URL(target, request.url);
    if (bidParam) redirectUrl.searchParams.set('bid', bidParam);

    return NextResponse.redirect(redirectUrl, { status: 308 });
  }

  // /bao-gia without tab → default to requests tab (old B3 /bao-gia was received)
  // Keep backward compat: plain /bao-gia stays as /bao-gia (defaults to requests tab in page)

  return NextResponse.next();
}

export const config = {
  matcher: ['/yeu-cau-bao-gia', '/so-sanh-bao-gia', '/duyet-bao-gia'],
};
