jest.mock('@/app/services/skills/skills.service', () => ({
  skillsService: {
    getSkillTools: jest.fn(),
  },
}));

import { skillsService } from '@/app/services/skills/skills.service';
import { resolveChatTools } from '@/app/services/chat/chat-tool-registry';

const mockedGetSkillTools = jest.mocked(skillsService.getSkillTools);

describe('resolveChatTools', () => {
  beforeEach(() => mockedGetSkillTools.mockReset());

  test('always includes notes and only includes domain-specific tools for the active domain', async () => {
    mockedGetSkillTools.mockResolvedValue([]);

    const tools = await resolveChatTools('skill-1', 'email');
    const names = tools.map((tool) => tool.function.name);

    expect(names).toContain('save_note');
    expect(names).toContain('list_emails');
    expect(names).not.toContain('list_jobs');
    expect(names).not.toContain('list_tickets');
  });

  test('filters universal tools using skill assignments', async () => {
    mockedGetSkillTools.mockResolvedValue(['search_web']);

    const tools = await resolveChatTools('skill-1', 'chat');
    const names = tools.map((tool) => tool.function.name);

    expect(names).toContain('search_web');
    expect(names).toContain('save_note');
    expect(names).not.toContain('execute_shell');
  });

  test('omits executor-backed tools unless shell access is explicitly allowed', async () => {
    mockedGetSkillTools.mockResolvedValue([]);

    const defaultNames = (await resolveChatTools(null, 'code')).map((tool) => tool.function.name);
    expect(defaultNames).not.toContain('execute_shell');
    expect(defaultNames).not.toContain('edit_file');

    const deniedNames = (await resolveChatTools(null, 'code', { allowShell: false }))
      .map((tool) => tool.function.name);
    expect(deniedNames).not.toContain('execute_shell');

    const allowedNames = (await resolveChatTools(null, 'code', { allowShell: true }))
      .map((tool) => tool.function.name);
    expect(allowedNames).toContain('execute_shell');
    expect(allowedNames).toContain('edit_file');
  });

  test('a skill that lists execute_shell does not bypass the shell check', async () => {
    mockedGetSkillTools.mockResolvedValue(['execute_shell', 'search_web']);

    const names = (await resolveChatTools('programmer', 'code')).map((tool) => tool.function.name);
    expect(names).toContain('search_web');
    expect(names).not.toContain('execute_shell');
  });
});
