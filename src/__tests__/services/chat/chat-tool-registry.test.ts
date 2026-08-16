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
    expect(names).toContain('recall_memory');
    expect(names).toContain('schedule_task');
    expect(names).toContain('learn_instruction');
    expect(names).not.toContain('execute_shell');
  });

  test('allows every domain to create memories while reserving global management for memory', async () => {
    mockedGetSkillTools.mockResolvedValue(['search_web']);

    const memoryNames = (await resolveChatTools('skill-1', 'memory'))
      .map((tool) => tool.function.name);
    const chatNames = (await resolveChatTools('skill-1', 'chat'))
      .map((tool) => tool.function.name);

    expect(memoryNames).toEqual(expect.arrayContaining([
      'recall_memory',
      'search_memory',
      'create_memory',
      'delete_memory',
    ]));
    expect(chatNames).toContain('recall_memory');
    expect(chatNames).toContain('create_memory');
    expect(chatNames).not.toContain('search_memory');
    expect(chatNames).not.toContain('delete_memory');
  });
});
