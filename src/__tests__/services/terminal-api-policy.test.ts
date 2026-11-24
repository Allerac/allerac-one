/** @jest-environment node */
import { terminalApiPolicy, terminalScopeDomains } from '@/app/services/terminal/terminal-api-policy';
import { AuthService, type User } from '@/app/services/auth/auth.service';

jest.mock('@/app/services/auth/auth.service', () => ({ AuthService: jest.fn() }));

test('self-service grants only identity by default and exposes options for accessible domains', async () => {
  const canAccessDomain = jest.fn().mockImplementation(async (_id, _admin, domain) => domain === 'notes');
  jest.mocked(AuthService).mockImplementation(() => ({ canAccessDomain }) as unknown as AuthService);
  const policy = await terminalApiPolicy({ id: 'owner', is_admin: false } as User);
  expect(policy.baseScopes).toEqual(['profile:read', 'capabilities:read', 'domains:read']);
  expect(policy.allowedScopes).toContain('notes:write');
  expect(policy.allowedScopes).not.toContain('jobs:write');
  expect(policy.allowedScopes).not.toContain('email:write');
  expect(policy.options.map(option => option.id)).toEqual(['notes-read', 'notes-write']);
});

test('service account domains follow only fully granted scope groups', () => {
  expect(terminalScopeDomains(['profile:read'])).toEqual([]);
  expect(terminalScopeDomains(['notes:read', 'tickets:read', 'tickets:write'])).toEqual(['notes', 'tickets']);
  expect(terminalScopeDomains(['health:read'])).toEqual([]);
  expect(terminalScopeDomains(['health:read', 'health:proxy:read'])).toEqual(['health']);
});
