jest.mock('@/app/actions/instagram', () => ({
  generateCaption: jest.fn(),
  generateTags: jest.fn(),
}));
jest.mock('@/app/tools/instagram.tool', () => ({
  InstagramTool: jest.fn(),
}));
const mockShellExecute = jest.fn();
jest.mock('@/app/tools/shell.tool', () => ({
  ShellTool: jest.fn().mockImplementation(() => ({ execute: mockShellExecute })),
}));

import { executeChatTool } from '@/app/services/chat/chat-tool-runner';
import { ShellTool } from '@/app/tools/shell.tool';

const context = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Ada',
    is_admin: false,
    created_at: new Date(),
  },
  githubToken: '',
  message: 'test',
  locale: 'en',
  emit: jest.fn(),
};

const adminContext = {
  ...context,
  user: { ...context.user, id: 'admin-1', is_admin: true },
};

describe('executeChatTool', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects shell working directories outside the user workspace', async () => {
    await expect(executeChatTool('execute_shell', {
      command: 'pwd',
      cwd: '/etc',
    }, adminContext)).resolves.toEqual({
      error: 'Invalid cwd. Shell commands must run inside your workspace.',
    });
  });

  test('emits client-side form updates', async () => {
    await expect(executeChatTool('update_social_form', {
      platform: 'tiktok',
      caption: 'New caption',
      tiktok_title: 'New title',
    }, context)).resolves.toEqual({
      success: true,
      message: 'Form updated.',
    });
    expect(context.emit).toHaveBeenCalledWith({
      type: 'studio_update',
      platform: 'tiktok',
      caption: 'New caption',
      tiktokTitle: 'New title',
    });
  });

  test('returns an explicit error for unavailable tools', async () => {
    await expect(executeChatTool('unknown_tool', {}, context)).resolves.toEqual({
      error: 'Tool unknown_tool not available',
    });
  });
});

describe('executeChatTool shell access (admin-only by default)', () => {
  const originalAllowlist = process.env.SHELL_ALLOWED_USER_IDS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SHELL_ALLOWED_USER_IDS;
    mockShellExecute.mockResolvedValue({
      stdout: '/workspace/projects/admin-1', stderr: '', exitCode: 0, success: true, command: 'pwd', duration_ms: 1,
    });
  });

  afterAll(() => {
    if (originalAllowlist === undefined) delete process.env.SHELL_ALLOWED_USER_IDS;
    else process.env.SHELL_ALLOWED_USER_IDS = originalAllowlist;
  });

  test('denies execute_shell to a non-admin without calling the executor', async () => {
    await expect(executeChatTool('execute_shell', { command: 'cat /project/.env' }, context)).resolves.toEqual({
      error: 'Shell access is restricted to administrators on this instance.',
    });
    expect(ShellTool).not.toHaveBeenCalled();
  });

  test('denies edit_file (executor-backed) to a non-admin', async () => {
    await expect(executeChatTool('edit_file', {
      path: '/workspace/projects/user-1/app/index.js',
      new_content: 'x',
    }, context)).resolves.toEqual({
      error: 'Shell access is restricted to administrators on this instance.',
    });
    expect(ShellTool).not.toHaveBeenCalled();
    expect(context.emit).not.toHaveBeenCalled();
  });

  test('denies a user whose admin flag is missing (fail closed)', async () => {
    const unknownRole = { ...context, user: { ...context.user, is_admin: undefined as unknown as boolean } };
    await expect(executeChatTool('execute_shell', { command: 'pwd' }, unknownRole)).resolves.toEqual({
      error: 'Shell access is restricted to administrators on this instance.',
    });
    expect(ShellTool).not.toHaveBeenCalled();
  });

  test('allows execute_shell for an admin, pinned to their workspace', async () => {
    const result = await executeChatTool('execute_shell', { command: 'pwd' }, adminContext);

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockShellExecute).toHaveBeenCalledWith('pwd', '/workspace/projects/admin-1', undefined);
  });

  test('allows a non-admin listed in SHELL_ALLOWED_USER_IDS', async () => {
    process.env.SHELL_ALLOWED_USER_IDS = 'user-1';
    await executeChatTool('execute_shell', { command: 'pwd' }, context);
    expect(mockShellExecute).toHaveBeenCalledWith('pwd', '/workspace/projects/user-1', undefined);
  });
});

describe('executeChatTool in public (website-facing) domains', () => {
  beforeEach(() => jest.clearAllMocks());

  test('denies execute_shell even for an admin account', async () => {
    await expect(executeChatTool('execute_shell', { command: 'id' }, {
      ...adminContext,
      domain: 'openworld',
    })).resolves.toEqual({ error: 'Tool execute_shell is not available in this domain.' });
    expect(ShellTool).not.toHaveBeenCalled();
  });

  test('denies GitHub tools even for an admin account with a token', async () => {
    await expect(executeChatTool('github_create_pr', { title: 'x', head: 'y' }, {
      ...adminContext,
      githubToken: 'ghp_system',
      domain: 'sales',
    })).resolves.toEqual({ error: 'Tool github_create_pr is not available in this domain.' });
  });
});
