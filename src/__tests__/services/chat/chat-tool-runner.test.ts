jest.mock('@/app/actions/instagram', () => ({
  generateCaption: jest.fn(),
  generateTags: jest.fn(),
}));
jest.mock('@/app/tools/instagram.tool', () => ({
  InstagramTool: jest.fn(),
}));

import { executeChatTool } from '@/app/services/chat/chat-tool-runner';

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

describe('executeChatTool', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects shell working directories outside the user workspace', async () => {
    await expect(executeChatTool('execute_shell', {
      command: 'pwd',
      cwd: '/etc',
    }, context)).resolves.toEqual({
      error: 'Invalid cwd. Shell commands must run inside your workspace.',
    });
  });

  test('emits client-side form updates', async () => {
    await expect(executeChatTool('update_instagram_form', {
      caption: 'New caption',
    }, context)).resolves.toEqual({
      success: true,
      message: 'Form updated.',
    });
    expect(context.emit).toHaveBeenCalledWith({
      type: 'studio_update',
      caption: 'New caption',
    });
  });

  test('returns an explicit error for unavailable tools', async () => {
    await expect(executeChatTool('unknown_tool', {}, context)).resolves.toEqual({
      error: 'Tool unknown_tool not available',
    });
  });
});
