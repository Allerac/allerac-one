/** @jest-environment node */

import { requireCurrentUser } from '@/app/lib/auth-session';
import { ShellTool } from '@/app/tools/shell.tool';
import { POST as runCommand } from '@/app/api/workspace/run/route';
import { DELETE as deletePath } from '@/app/api/workspace/delete/route';
import { POST as killProcess } from '@/app/api/workspace/kill/route';

const mockExecute = jest.fn();

jest.mock('@/app/lib/auth-session', () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    authenticationErrorResponse: (error: unknown) => (
      error instanceof UnauthorizedError
        ? Response.json({ error: 'Unauthorized' }, { status: 401 })
        : null
    ),
    requireCurrentUser: jest.fn(),
  };
});

jest.mock('@/app/tools/shell.tool', () => ({
  ShellTool: jest.fn().mockImplementation(() => ({
    execute: mockExecute,
  })),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Workspace route authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: 'user-a',
      email: 'a@example.com',
      name: 'User A',
      is_admin: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('rejects command execution in another user workspace', async () => {
    const response = await runCommand(jsonRequest(
      'http://localhost/api/workspace/run',
      'POST',
      { command: 'pwd', cwd: '/workspace/projects/user-b/project' }
    ));

    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects deletion in another user workspace', async () => {
    const response = await deletePath(jsonRequest(
      'http://localhost/api/workspace/delete',
      'DELETE',
      { path: '/workspace/projects/user-b/project' }
    ));

    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('rejects a process cwd that only shares the user root prefix', async () => {
    mockExecute.mockResolvedValueOnce({
      success: true,
      stdout: '/workspace/projects/user-a-evil/project\n',
      stderr: '',
      exitCode: 0,
    });

    const response = await killProcess(jsonRequest(
      'http://localhost/api/workspace/kill',
      'POST',
      { pid: 123 }
    ));

    expect(response.status).toBe(403);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('constructs shell tools only after session authorization', async () => {
    const UnauthorizedError = (await import('@/app/lib/auth-session')).UnauthorizedError;
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await runCommand(jsonRequest(
      'http://localhost/api/workspace/run',
      'POST',
      { command: 'pwd' }
    ));

    expect(response.status).toBe(401);
    expect(ShellTool).not.toHaveBeenCalled();
  });
});
