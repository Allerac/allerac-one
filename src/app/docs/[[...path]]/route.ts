import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { DOCS_BASE_PATH, docsContentType, docsSiteDir, resolveDocsFile } from '@/app/lib/docs-site';

/**
 * Serves the bundled mkdocs site at /docs on the app's own hostname, so it works
 * on every Unit behind Cloudflare Tunnel. The docs are internal: a valid session
 * is required. Pages use .html URLs (mkdocs.app.yml sets use_directory_urls: false)
 * because Next.js strips trailing slashes, which would break relative links.
 */
export const dynamic = 'force-dynamic';

const authService = new AuthService();

async function isSignedIn(): Promise<boolean> {
  const token = (await cookies()).get('session_token')?.value;
  if (!token) return false;
  return Boolean(await authService.validateSession(token));
}

async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

/**
 * Relative Location header: behind Cloudflare Tunnel / standalone mode,
 * request.url carries the internal host (e.g. localhost), not the Unit's hostname.
 */
function redirectTo(location: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: location } });
}

function notFound(): NextResponse {
  return new NextResponse('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  if (!(await isSignedIn())) {
    return redirectTo('/login');
  }

  const segments = ((await params).path ?? []).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return '\0';
    }
  });
  const root = docsSiteDir();
  const target = resolveDocsFile(root, segments);
  if (!target) return notFound();

  const stat = await statOrNull(target);
  if (stat?.isDirectory()) {
    // Directory URLs (/docs, /docs/api) -> their index page, so relative links resolve.
    const index = path.join(target, 'index.html');
    if (!(await statOrNull(index))?.isFile()) return notFound();
    const prefix = [DOCS_BASE_PATH, ...segments.map(encodeURIComponent)].join('/');
    return redirectTo(`${prefix}/index.html`);
  }
  if (!stat?.isFile()) {
    if (segments.length === 0) {
      // No bundled site (e.g. `npm run dev`): the image build creates it.
      return new NextResponse(
        'Documentation is not bundled in this build. Run `mkdocs build -f mkdocs.app.yml -d docs-site` or `docker compose up docs`.',
        { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    }
    return notFound();
  }

  const body = await fs.readFile(target);
  const isHtml = target.endsWith('.html');
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': docsContentType(target),
      // Hashed theme assets can be cached; pages change with every release.
      'Cache-Control': isHtml ? 'private, no-cache' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
