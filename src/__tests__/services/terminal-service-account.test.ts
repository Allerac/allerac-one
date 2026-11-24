/** @jest-environment node */
import pool from '@/app/clients/db';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { ensureTerminalServiceAccount, syncTerminalServiceAccountDomains, TERMINAL_SERVICE_ACCOUNT_EMAIL } from '@/app/services/terminal/terminal-service-account';

const client = { query: jest.fn(), release: jest.fn() };
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('@/app/services/api-keys/api-key.service', () => ({ apiKeyService: { list: jest.fn() } }));

const query = pool.query as unknown as jest.Mock;
beforeEach(() => { (pool.connect as unknown as jest.Mock).mockResolvedValue(client); client.query.mockResolvedValue({ rows: [] }); });
afterEach(() => jest.resetAllMocks());

test('creates a passwordless, non-admin service account on the reserved address', async () => {
  query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'svc', is_service_account: true }] });
  expect(await ensureTerminalServiceAccount()).toBe('svc');
  const insert = query.mock.calls[1];
  expect(insert[0]).toMatch(/INSERT INTO users \(email, name, is_admin, is_active, is_service_account\)/);
  expect(insert[0]).not.toMatch(/password/);
  expect(insert[1]).toEqual([TERMINAL_SERVICE_ACCOUNT_EMAIL]);
  expect(TERMINAL_SERVICE_ACCOUNT_EMAIL.endsWith('.invalid')).toBe(true);
});

test('refuses to adopt a regular user that took the reserved address', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 'person', is_service_account: false }] });
  await expect(ensureTerminalServiceAccount()).rejects.toThrow(/regular user/);
});

test('domain access mirrors the active terminal keys of every provider', async () => {
  jest.mocked(apiKeyService.list).mockResolvedValue([
    { name: 'Terminal API · claude', scopes: ['notes:read'], revokedAt: null, expiresAt: null },
    { name: 'Terminal API · codex', scopes: ['tickets:read', 'tickets:write'], revokedAt: null, expiresAt: new Date(Date.now() + 1000) },
    { name: 'Terminal API · codex', scopes: ['health:read', 'health:proxy:read'], revokedAt: new Date(), expiresAt: null },
    { name: 'Personal key', scopes: ['memory:read', 'documents:read'], revokedAt: null, expiresAt: null },
  ] as Awaited<ReturnType<typeof apiKeyService.list>>);
  await syncTerminalServiceAccountDomains('svc');
  expect(client.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toEqual(['BEGIN', 'DELETE', 'INSERT', 'COMMIT']);
  expect(client.query.mock.calls[2][1]).toEqual(['svc', ['notes', 'tickets']]);
});
