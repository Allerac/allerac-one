/** @jest-environment node */
jest.mock('@/app/services/skills/skills.service', () => ({
  skillsService: { getSkillTools: jest.fn() },
}));
const mockLoadSettings = jest.fn();
jest.mock('@/app/services/agent/agent-tool-settings.repository', () => ({
  loadAgentToolSettings: () => mockLoadSettings(),
}));

import type { AgentToolSettings } from '@/app/services/agent/agent-tool-settings';

// Health and music tool definitions are built at import time from these env vars.
process.env.HEALTH_WORKER_SECRET = 'test-secret';
process.env.SPOTIFY_CLIENT_ID = 'test-client';
/* eslint-disable @typescript-eslint/no-require-imports */
const { skillsService } = require('@/app/services/skills/skills.service');
const { resolveChatTools } = require('@/app/services/chat/chat-tool-registry');
const { explicitBotToolSettings } = require('@/app/services/agent/bot-runtime');
/* eslint-enable @typescript-eslint/no-require-imports */

const names = (tools: Array<{ function: { name: string } }>) => tools.map((tool) => tool.function.name);
const botTools = async (partial: Partial<AgentToolSettings>, extra: Record<string, unknown> = {}) => names(
  await resolveChatTools(null, 'doctor', {
    bot: true,
    agentToolSettings: explicitBotToolSettings({ modules: {}, tools: {}, skills: {}, ...partial }),
    ...extra,
  }),
);

describe('bot tool assembly (multi-bot PR 2)', () => {
  beforeEach(() => {
    (skillsService.getSkillTools as jest.Mock).mockReset().mockResolvedValue([]);
    mockLoadSettings.mockReset();
  });

  it('gives a bot with nothing checked only the general and core memory tools', async () => {
    const tools = await botTools({});
    expect(tools).toEqual(expect.arrayContaining(['recall_memory', 'create_memory', 'search_knowledge', 'schedule_task']));
    for (const tool of ['get_health_summary', 'list_emails', 'send_email', 'save_note', 'list_jobs', 'list_tickets', 'search_memory']) {
      expect(tools).not.toContain(tool);
    }
    expect(mockLoadSettings).not.toHaveBeenCalled();
  });

  it('offers exactly the checked capabilities', async () => {
    const tools = await botTools({ modules: { health: true, notes: true } });
    expect(tools).toEqual(expect.arrayContaining(['get_health_summary', 'save_note']));
    expect(tools).not.toContain('list_emails');
    expect(tools).not.toContain('list_jobs');
  });

  it('honours single tool toggles inside a checked capability', async () => {
    const tools = await botTools({ modules: { notes: true }, tools: { delete_note: false } });
    expect(tools).toContain('save_note');
    expect(tools).not.toContain('delete_note');
  });

  it('never offers federation tools to a bot, even when asked', async () => {
    const tools = await botTools({ modules: { notes: true } }, { allowFederation: true });
    expect(tools).not.toContain('ask_peer_agent');
    expect(tools).not.toContain('list_peer_agents');
  });

  it('does not offer shell tools unless the caller allows them', async () => {
    const tools = await botTools({});
    expect(tools).not.toContain('execute_shell');
  });

  it('fails closed without bot settings', async () => {
    await expect(resolveChatTools(null, 'doctor', { bot: true })).rejects.toThrow('bot tool settings');
  });
});
