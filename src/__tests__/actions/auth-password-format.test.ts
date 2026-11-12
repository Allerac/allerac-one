/**
 * Auth server actions only accept the client pre-hash. A form that sends the
 * plaintext (as the setup wizard once did) must fail loudly instead of storing
 * a hash the login form can never match.
 */
import { createHash } from 'crypto';

const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockMigrate = jest.fn();
const mockCookieSet = jest.fn();

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: mockCookieSet, delete: jest.fn() }),
}));
jest.mock('@/app/services/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    register: (...a: unknown[]) => mockRegister(...a),
    login: (...a: unknown[]) => mockLogin(...a),
    migratePassword: (...a: unknown[]) => mockMigrate(...a),
  })),
}));
jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({ loadAll: jest.fn() })),
}));
jest.mock('@/app/actions/invites', () => ({ validateInviteToken: jest.fn() }));
jest.mock('@/app/lib/auth-session', () => ({ requireCurrentUser: jest.fn() }));
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));

import { login, migratePassword, register, registerWithInvite, resetPassword } from '@/app/actions/auth';

const prehash = createHash('sha256').update('password123').digest('hex');
const session = { token: 'tok', expiresAt: new Date(Date.now() + 60_000) };
const user = { id: 'u1', email: 'a@example.com', name: null, is_admin: true, created_at: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('auth actions reject passwords that were not pre-hashed', () => {
  it('register', async () => {
    const result = await register('a@example.com', 'password123');
    expect(result).toEqual({ success: false, error: expect.stringMatching(/password format/i) });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('registerWithInvite', async () => {
    const result = await registerWithInvite('token', 'a@example.com', 'password123');
    expect(result).toEqual({ success: false, error: expect.stringMatching(/password format/i) });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('login', async () => {
    const result = await login('a@example.com', 'password123');
    expect(result).toEqual({ success: false, error: expect.stringMatching(/password format/i) });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('migratePassword', async () => {
    const result = await migratePassword('a@example.com', 'password123');
    expect(result).toEqual({ success: false, error: expect.stringMatching(/password format/i) });
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('resetPassword', async () => {
    const result = await resetPassword('token', 'password123');
    expect(result).toEqual({ success: false, error: expect.stringMatching(/password format/i) });
  });

  it('never logs the rejected value', async () => {
    await login('a@example.com', 'plaintext-secret');
    for (const call of (console.warn as jest.Mock).mock.calls) {
      expect(JSON.stringify(call)).not.toContain('plaintext-secret');
    }
  });
});

describe('auth actions accept the client pre-hash', () => {
  it('register passes the pre-hash through and sets the session cookie', async () => {
    mockRegister.mockResolvedValue({ success: true, user, session });
    const result = await register('a@example.com', prehash, 'A');
    expect(result).toEqual({ success: true, user });
    expect(mockRegister).toHaveBeenCalledWith('a@example.com', prehash, 'A');
    expect(mockCookieSet).toHaveBeenCalledWith('session_token', 'tok', expect.any(Object));
  });

  it('login passes the pre-hash through', async () => {
    mockLogin.mockResolvedValue({ success: false, error: 'Invalid email or password' });
    const result = await login('a@example.com', prehash);
    expect(result).toEqual({ success: false, error: 'Invalid email or password', needsMigration: undefined });
    expect(mockLogin).toHaveBeenCalledWith('a@example.com', prehash);
  });
});
