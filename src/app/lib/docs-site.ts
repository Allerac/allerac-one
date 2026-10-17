import path from 'path';

/**
 * Static documentation site (mkdocs build, see mkdocs.app.yml) bundled into the
 * app image and served at /docs by src/app/docs/[[...path]]/route.ts.
 */
export const DOCS_BASE_PATH = '/docs';

export function docsSiteDir(env: Record<string, string | undefined> = process.env): string {
  return env.DOCS_SITE_DIR?.trim() || path.join(process.cwd(), 'docs-site');
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.gz': 'application/gzip',
};

export function docsContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Maps URL path segments to an absolute file path inside the docs root.
 * Returns null for anything that would escape the root (.., absolute paths, NUL).
 */
export function resolveDocsFile(root: string, segments: string[]): string | null {
  if (segments.some((s) => s === '' || s === '.' || s === '..' || s.includes('\0') || s.includes('/') || s.includes('\\'))) {
    return null;
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) return null;
  return target;
}
