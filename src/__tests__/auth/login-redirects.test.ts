/**
 * A signed-in non-admin whose domains are gone (or who has none) used to bounce
 * /login -> / -> /login?error=no-access -> / ... forever. These tests follow
 * every redirect hop and fail on a cycle.
 */
const REDIRECT = 'NEXT_REDIRECT';
const NOT_FOUND = 'NEXT_NOT_FOUND';

jest.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error(REDIRECT), { url }); },
  notFound: () => { throw new Error(NOT_FOUND); },
}));
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'session_token' ? { value: 'tok' } : undefined) }),
}));

const mockValidateSession = jest.fn();
const mockGetFirstDomainSlug = jest.fn();
const mockCanAccessDomain = jest.fn();
jest.mock('@/app/services/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    validateSession: (...a: unknown[]) => mockValidateSession(...a),
    getFirstDomainSlug: (...a: unknown[]) => mockGetFirstDomainSlug(...a),
    canAccessDomain: (...a: unknown[]) => mockCanAccessDomain(...a),
  })),
}));
jest.mock('@/modules/registry', () => ({ isDomainEnabled: () => true }));
jest.mock('@/app/login/LoginClient', () => ({ __esModule: true, default: () => null }));

import { deniedDomainPathFor, homePathFor, NO_ACCESS_PATH } from '@/app/lib/home-path';
import { requireAdmin, requireDomainAccess } from '@/app/lib/domain-access';
import LoginPage from '@/app/login/page';

/** Renders the server route for `path`; returns the redirect target, or null when the page renders. */
async function visit(path: string): Promise<string | null> {
  try {
    const route = path.split('?')[0];
    if (route === '/login') await LoginPage({ searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(path.split('?')[1] ?? ''))) });
    else if (route === '/') await requireAdmin();
    else await requireDomainAccess(route.slice(1));
    return null;
  } catch (error) {
    const e = error as Error & { url?: string };
    if (e.message === REDIRECT) return e.url!;
    throw error;
  }
}

/** Follows redirects from `start`; returns where the user finally lands. */
async function land(start: string): Promise<string> {
  const seen: string[] = [];
  let path = start;
  for (;;) {
    if (seen.includes(path)) throw new Error(`redirect loop: ${[...seen, path].join(' -> ')}`);
    seen.push(path);
    const next = await visit(path);
    if (next === null) return path;
    path = next;
  }
}

const domainUser = { id: 'u1', email: 'bot@openworld.test', name: 'Bot', is_admin: false, created_at: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateSession.mockResolvedValue(domainUser);
});

describe('home-path', () => {
  test('admins get the hub, others their domain or no-access', () => {
    expect(homePathFor(true, 'openworld')).toBe('/');
    expect(homePathFor(false, 'openworld')).toBe('/openworld');
    expect(homePathFor(false, null)).toBe(NO_ACCESS_PATH);
  });

  test('a denied domain never redirects to itself', () => {
    expect(deniedDomainPathFor('openworld', 'openworld')).toBe(NO_ACCESS_PATH);
    expect(deniedDomainPathFor('openworld', 'chat')).toBe('/openworld');
    expect(deniedDomainPathFor(null, 'chat')).toBe(NO_ACCESS_PATH);
  });
});

describe('redirects of a domain-only user', () => {
  test('lands on its only domain from the hub and from /login', async () => {
    mockGetFirstDomainSlug.mockResolvedValue('openworld');
    mockCanAccessDomain.mockImplementation(async (_id: string, _admin: boolean, slug: string) => slug === 'openworld');
    await expect(land('/')).resolves.toBe('/openworld');
    await expect(land('/login')).resolves.toBe('/openworld');
    await expect(land('/chat')).resolves.toBe('/openworld');
  });

  test('without any accessible domain it stops on the no-access login page', async () => {
    mockGetFirstDomainSlug.mockResolvedValue(null);
    mockCanAccessDomain.mockResolvedValue(false);
    await expect(land('/')).resolves.toBe(NO_ACCESS_PATH);
    await expect(land('/login')).resolves.toBe('/login');
    await expect(land('/openworld')).resolves.toBe(NO_ACCESS_PATH);
  });

  test('a first domain it cannot open does not loop', async () => {
    mockGetFirstDomainSlug.mockResolvedValue('openworld');
    mockCanAccessDomain.mockResolvedValue(false);
    await expect(land('/')).resolves.toBe(NO_ACCESS_PATH);
  });

  test('admins land on the hub', async () => {
    mockValidateSession.mockResolvedValue({ ...domainUser, is_admin: true });
    await expect(land('/login')).resolves.toBe('/');
  });
});
