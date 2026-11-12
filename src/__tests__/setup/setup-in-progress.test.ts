/**
 * First-run setup, server side: register() marks the setup as in progress so
 * /login keeps the wizard for the new admin until markSetupComplete().
 */
import { createHash } from 'crypto';

const REDIRECT = 'NEXT_REDIRECT';

const mockCookies = new Map<string, string>();
const mockCookieSet = jest.fn((name: string, value: string) => { mockCookies.set(name, value); });
const mockCookieDelete = jest.fn((name: string) => { mockCookies.delete(name); });

jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mockCookies.has(name) ? { value: mockCookies.get(name) } : undefined),
    set: mockCookieSet,
    delete: mockCookieDelete,
  }),
}));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error(REDIRECT), { url }); },
}));

const mockValidateSession = jest.fn();
const mockServiceRegister = jest.fn();
jest.mock('@/app/services/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    validateSession: (...a: unknown[]) => mockValidateSession(...a),
    getFirstDomainSlug: async () => null,
    register: (...a: unknown[]) => mockServiceRegister(...a),
  })),
}));
jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({ loadAll: jest.fn() })),
}));
jest.mock('@/app/actions/invites', () => ({ validateInviteToken: jest.fn() }));
jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
  requireCurrentAdmin: jest.fn(),
}));
jest.mock('@/app/login/LoginClient', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));

import LoginPage from '@/app/login/page';
import * as authActions from '@/app/actions/auth';
import * as setupActions from '@/app/actions/setup';

const admin = { id: 'u1', email: 'admin@example.com', name: 'Admin', is_admin: true, created_at: new Date() };
const session = { token: 'tok', expiresAt: new Date(Date.now() + 60_000) };

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies.clear();
});

describe('register() marks the first-admin setup as in progress', () => {
  it('sets setup_in_progress for the first (admin) user', async () => {
    mockServiceRegister.mockResolvedValue({ success: true, user: admin, session });
    const prehash = createHash('sha256').update('password123').digest('hex');
    await authActions.register('admin@example.com', prehash, 'Admin');
    expect(mockCookies.get('session_token')).toBe('tok');
    expect(mockCookies.get('setup_in_progress')).toBe('1');
  });

  it('does not set it for later (non-admin) users', async () => {
    mockServiceRegister.mockResolvedValue({ success: true, user: { ...admin, is_admin: false }, session });
    const prehash = createHash('sha256').update('password123').digest('hex');
    await authActions.register('user@example.com', prehash);
    expect(mockCookies.has('setup_in_progress')).toBe(false);
  });

  it('markSetupComplete clears it', async () => {
    mockCookies.set('setup_in_progress', '1');
    await setupActions.markSetupComplete();
    expect(mockCookies.has('setup_in_progress')).toBe(false);
    expect(mockCookies.get('setup_complete')).toBe('true');
  });
});

describe('/login while setup is in progress', () => {
  async function renderPage() {
    try {
      return { element: await LoginPage({ searchParams: Promise.resolve({}) }), redirect: null };
    } catch (error) {
      const e = error as Error & { url?: string };
      if (e.message === REDIRECT) return { element: null, redirect: e.url };
      throw error;
    }
  }

  it('keeps rendering the wizard for the new admin instead of redirecting', async () => {
    mockCookies.set('session_token', 'tok');
    mockCookies.set('setup_in_progress', '1');
    mockValidateSession.mockResolvedValue(admin);
    const { element, redirect } = await renderPage();
    expect(redirect).toBeNull();
    expect((element as React.ReactElement<{ resumeSetup?: boolean }>).props.resumeSetup).toBe(true);
  });

  it('redirects the admin to the hub once setup is complete', async () => {
    mockCookies.set('session_token', 'tok');
    mockValidateSession.mockResolvedValue(admin);
    await expect(renderPage()).resolves.toEqual({ element: null, redirect: '/' });
  });
});
