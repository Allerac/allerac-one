/** @jest-environment node */

import '../__mocks__/db';
import pool from '@/app/clients/db';
import {
  canUserIdUseShell,
  isShellAllowedFor,
  SHELL_TOOL_NAMES,
  withoutShellTools,
} from '@/app/lib/shell-access';

jest.mock('@/app/lib/auth-session', () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  requireCurrentUser: jest.fn(),
}));

const mockQuery = pool.query as unknown as jest.Mock;

describe('isShellAllowedFor', () => {
  it('allows admins', () => {
    expect(isShellAllowedFor({ id: 'u1', is_admin: true }, {})).toBe(true);
  });

  it('denies non-admins by default', () => {
    expect(isShellAllowedFor({ id: 'u1', is_admin: false }, {})).toBe(false);
  });

  it('fails closed when the role or user is unknown', () => {
    expect(isShellAllowedFor({ id: 'u1' }, {})).toBe(false);
    expect(isShellAllowedFor({ id: 'u1', is_admin: null }, {})).toBe(false);
    expect(isShellAllowedFor(null, {})).toBe(false);
    expect(isShellAllowedFor(undefined, {})).toBe(false);
    expect(isShellAllowedFor({ is_admin: true }, {})).toBe(false);
  });

  it('allows non-admins listed by user id in SHELL_ALLOWED_USER_IDS', () => {
    const env = { SHELL_ALLOWED_USER_IDS: ' AAAA-1 , bbbb-2 ,' };
    expect(isShellAllowedFor({ id: 'aaaa-1', is_admin: false }, env)).toBe(true);
    expect(isShellAllowedFor({ id: 'bbbb-2', is_admin: false }, env)).toBe(true);
    expect(isShellAllowedFor({ id: 'cccc-3', is_admin: false }, env)).toBe(false);
  });

  it('does not treat an empty allowlist entry as a wildcard', () => {
    expect(isShellAllowedFor({ id: '', is_admin: false }, { SHELL_ALLOWED_USER_IDS: ',' })).toBe(false);
  });
});

describe('canUserIdUseShell', () => {
  beforeEach(() => mockQuery.mockReset());

  it('allows a user whose stored role is admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', is_admin: true }] });
    await expect(canUserIdUseShell('u1')).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('is_admin'), ['u1']);
  });

  it('denies a non-admin', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', is_admin: false }] });
    await expect(canUserIdUseShell('u1')).resolves.toBe(false);
  });

  it('denies when the user does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(canUserIdUseShell('ghost')).resolves.toBe(false);
  });

  it('denies when the role lookup fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    await expect(canUserIdUseShell('u1')).resolves.toBe(false);
    spy.mockRestore();
  });

  it('denies an empty user id without querying', async () => {
    await expect(canUserIdUseShell('')).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('withoutShellTools', () => {
  it('removes every executor-backed tool', () => {
    const tools = [...SHELL_TOOL_NAMES, 'search_web'].map(name => ({ function: { name } }));
    expect(withoutShellTools(tools).map(tool => tool.function.name)).toEqual(['search_web']);
  });
});
