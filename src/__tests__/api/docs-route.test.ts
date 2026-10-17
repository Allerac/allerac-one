/** @jest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { resolveDocsFile, docsContentType } from '@/app/lib/docs-site';

const mockCookieGet = jest.fn();
const mockValidateSession = jest.fn();

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: mockCookieGet }),
}));
jest.mock('@/app/services/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({ validateSession: mockValidateSession })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET } = require('@/app/docs/[[...path]]/route') as typeof import('@/app/docs/[[...path]]/route');

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-site-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>Home</h1>');
  fs.mkdirSync(path.join(root, 'api'));
  fs.writeFileSync(path.join(root, 'api', 'index.html'), '<h1>API</h1>');
  fs.writeFileSync(path.join(root, 'style.css'), 'body{}');
  fs.writeFileSync(path.join(path.dirname(root), 'secret.txt'), 'nope');
  process.env.DOCS_SITE_DIR = root;
});

afterAll(() => {
  delete process.env.DOCS_SITE_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  mockCookieGet.mockReturnValue({ value: 'token' });
  mockValidateSession.mockResolvedValue({ id: 'u1' });
});

function get(pathname: string, segments?: string[]) {
  return GET(new NextRequest(`http://unit.example${pathname}`), { params: Promise.resolve({ path: segments }) });
}

describe('docs-site helpers', () => {
  it('keeps paths inside the root', () => {
    expect(resolveDocsFile('/srv/docs', ['api', 'index.html'])).toBe(path.resolve('/srv/docs/api/index.html'));
    expect(resolveDocsFile('/srv/docs', [])).toBe(path.resolve('/srv/docs'));
    expect(resolveDocsFile('/srv/docs', ['..', 'etc', 'passwd'])).toBeNull();
    expect(resolveDocsFile('/srv/docs', ['a/../../x'])).toBeNull();
    expect(resolveDocsFile('/srv/docs', ['a\0b'])).toBeNull();
  });

  it('maps content types', () => {
    expect(docsContentType('a/index.html')).toContain('text/html');
    expect(docsContentType('x.woff2')).toBe('font/woff2');
    expect(docsContentType('x.unknown')).toBe('application/octet-stream');
  });
});

describe('GET /docs', () => {
  it('redirects to login without a session', async () => {
    mockCookieGet.mockReturnValue(undefined);
    const res = await get('/docs/index.html', ['index.html']);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('redirects to login with an invalid session', async () => {
    mockValidateSession.mockResolvedValue(null);
    const res = await get('/docs/index.html', ['index.html']);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('redirects directories to their index page', async () => {
    expect((await get('/docs')).headers.get('location')).toBe('/docs/index.html');
    expect((await get('/docs/api', ['api'])).headers.get('location')).toBe('/docs/api/index.html');
  });

  it('serves pages and assets with their content type', async () => {
    const page = await get('/docs/api/index.html', ['api', 'index.html']);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toBe('<h1>API</h1>');
    const css = await get('/docs/style.css', ['style.css']);
    expect(css.headers.get('content-type')).toContain('text/css');
  });

  it('returns 404 for missing files and traversal attempts', async () => {
    expect((await get('/docs/missing.html', ['missing.html'])).status).toBe(404);
    expect((await get('/docs/..%2Fsecret.txt', ['..%2Fsecret.txt'])).status).toBe(404);
    expect((await get('/docs/x', ['..', 'secret.txt'])).status).toBe(404);
  });
});
