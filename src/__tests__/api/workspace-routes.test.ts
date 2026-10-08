/** @jest-environment node */

import { requireCurrentUser } from '@/app/lib/auth-session';
import { ShellTool } from '@/app/tools/shell.tool';
import { POST as runCommand } from '@/app/api/workspace/run/route';
import { DELETE as deletePath } from '@/app/api/workspace/delete/route';
import { POST as killProcess } from '@/app/api/workspace/kill/route';
import { GET as readFile, PUT as writeFile } from '@/app/api/workspace/file/route';
import { GET as listProcesses } from '@/app/api/workspace/processes/route';
import { GET as listProjects } from '@/app/api/workspace/projects/route';
import { GET as readTree } from '@/app/api/workspace/tree/route';

const mockExecute = jest.fn();

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));

jest.mock('@/app/lib/auth-session', () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return {
    UnauthorizedError,
    ForbiddenError,
    authenticationErrorResponse: (error: unknown) => {
      if (error instanceof UnauthorizedError) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (error instanceof ForbiddenError) return Response.json({ error: 'Forbidden' }, { status: 403 });
      return null;
    },
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

const ADMIN_USER = {
  id: 'user-a',
  email: 'a@example.com',
  name: 'User A',
  is_admin: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const NON_ADMIN_USER = {
  id: 'user-b',
  email: 'b@example.com',
  name: 'User B',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Workspace route authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Path-boundary tests run as an admin, the only role with shell access by default.
    mockRequireCurrentUser.mockResolvedValue(ADMIN_USER);
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

describe('Workspace shell access (admin-only by default)', () => {
  const originalAllowlist = process.env.SHELL_ALLOWED_USER_IDS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SHELL_ALLOWED_USER_IDS;
    mockExecute.mockResolvedValue({
      stdout: 'ok', stderr: '', exitCode: 0, success: true, command: 'pwd', duration_ms: 1,
    });
  });

  afterAll(() => {
    if (originalAllowlist === undefined) delete process.env.SHELL_ALLOWED_USER_IDS;
    else process.env.SHELL_ALLOWED_USER_IDS = originalAllowlist;
  });

  it('returns 403 to a non-admin on the run route without touching the executor', async () => {
    mockRequireCurrentUser.mockResolvedValue(NON_ADMIN_USER);

    const response = await runCommand(jsonRequest(
      'http://localhost/api/workspace/run',
      'POST',
      { command: 'cat /project/.env' }
    ));

    expect(response.status).toBe(403);
    expect(ShellTool).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('returns 403 to a non-admin on every executor-backed workspace route', async () => {
    mockRequireCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    const root = '/workspace/projects/user-b';

    const responses = await Promise.all([
      deletePath(jsonRequest('http://localhost/api/workspace/delete', 'DELETE', { path: `${root}/p` })),
      killProcess(jsonRequest('http://localhost/api/workspace/kill', 'POST', { pid: 123 })),
      readFile(new Request(`http://localhost/api/workspace/file?path=${root}/p/a.txt`)),
      writeFile(jsonRequest('http://localhost/api/workspace/file', 'PUT', { path: `${root}/p/a.txt`, content: 'x' })),
      listProcesses(),
      listProjects(),
      readTree(new Request(`http://localhost/api/workspace/tree?path=${root}`)),
    ]);

    expect(responses.map(response => response.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
    expect(ShellTool).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('lets an admin run a command in their workspace', async () => {
    mockRequireCurrentUser.mockResolvedValue(ADMIN_USER);

    const response = await runCommand(jsonRequest(
      'http://localhost/api/workspace/run',
      'POST',
      { command: 'pwd' }
    ));

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith('pwd', '/workspace/projects/user-a', 15000);
  });

  it('lets a non-admin listed in SHELL_ALLOWED_USER_IDS run a command', async () => {
    process.env.SHELL_ALLOWED_USER_IDS = 'someone-else, user-b';
    mockRequireCurrentUser.mockResolvedValue(NON_ADMIN_USER);

    const response = await runCommand(jsonRequest(
      'http://localhost/api/workspace/run',
      'POST',
      { command: 'pwd' }
    ));

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith('pwd', '/workspace/projects/user-b', 15000);
  });
});
