/**
 * An empty resend_from_email (saved by clearing the field) must fall back to
 * the default sender instead of sending with an empty "from".
 */
const mockSend = jest.fn();
const mockLoadAll = jest.fn();
const mockQuery = jest.fn();

jest.mock('resend', () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })) }), { virtual: true });
jest.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: jest.fn(), delete: jest.fn() }) }));
jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({ loadAll: () => mockLoadAll() })),
}));
jest.mock('@/app/services/auth/auth.service', () => ({ AuthService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('@/app/actions/invites', () => ({ validateInviteToken: jest.fn() }));
jest.mock('@/app/lib/auth-session', () => ({ requireCurrentUser: jest.fn() }));
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { requestPasswordReset } from '@/app/actions/auth';

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockImplementation(async (sql: string) => (
    sql.startsWith('SELECT') ? { rows: [{ id: 'u1', email: 'a@example.com', name: 'A' }] } : { rows: [] }
  ));
  mockSend.mockResolvedValue({ id: 'm1' });
});

it.each([
  ['an empty sender', '', 'noreply@allerac.ai'],
  ['no sender', null, 'noreply@allerac.ai'],
  ['a configured sender', 'Allerac <hi@example.com>', 'Allerac <hi@example.com>'],
])('uses the right "from" with %s', async (_label, configured, expected) => {
  mockLoadAll.mockResolvedValue({ resend_api_key: 're_test', resend_from_email: configured });
  const result = await requestPasswordReset('a@example.com');
  expect(result.success).toBe(true);
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ from: expected }));
});
