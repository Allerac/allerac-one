import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Cloudflare Tunnel sometimes percent-encodes '?' as '%3F' in the URL path
 * before forwarding to the origin. This causes Next.js route matching to fail
 * because the query string becomes part of the path segment (no route matches).
 *
 * This middleware detects the encoded '?' in the pathname and rewrites the URL
 * to restore proper path + query string structure before route matching runs.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const idx = pathname.indexOf('%3F');
  if (idx !== -1) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(0, idx);
    const rawQuery = pathname.slice(idx + 3) // skip '%3F'
      .replace(/%26/gi, '&')
      .replace(/%3D/gi, '=');
    new URLSearchParams(rawQuery).forEach((v, k) => url.searchParams.set(k, v));
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
