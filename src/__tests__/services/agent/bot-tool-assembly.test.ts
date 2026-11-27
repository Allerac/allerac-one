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
const { resolveChatTools, isToolForbiddenByPolicy, canUseManagerTools, canUseFederationTools } = require('@/app/services/chat/chat-tool-registry');
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

describe('Manager tools and the consult policy (multi-bot PR 7)', () => {
  const ALL_ON = { modules: { notes: true, email: true, jobs: true, tickets: true, health: true, memory: true }, tools: {}, skills: {} };
  beforeEach(() => {
    (skillsService.getSkillTools as jest.Mock).mockReset().mockResolvedValue([]);
    mockLoadSettings.mockReset().mockResolvedValue(ALL_ON);
  });

  it('offers ask_agent only to the default agent, and only when allowed', async () => {
    expect(names(await resolveChatTools(null, 'chat', { allowManager: true }))).toContain('ask_agent');
    expect(names(await resolveChatTools(null, 'chat', {}))).not.toContain('ask_agent');
    expect(names(await resolveChatTools(null, 'chat', { allowManager: true, toolPolicy: 'federated' }))).not.toContain('ask_agent');
    expect(names(await resolveChatTools(null, 'health', { allowManager: true }))).not.toContain('ask_agent');
    expect(await botTools({ modules: { notes: true } }, { allowManager: true })).not.toContain('ask_agent');
  });

  it('gives a consulted bot its own capabilities, read-only', async () => {
    const tools = await botTools({ modules: { health: true, email: true, notes: true, jobs: true } }, { toolPolicy: 'consult' });
    expect(tools).toEqual(expect.arrayContaining(['get_health_summary', 'list_emails', 'read_email', 'list_notes', 'query_vault', 'list_jobs', 'recall_memory', 'search_knowledge']));
    for (const tool of ['send_email', 'save_note', 'delete_note', 'create_job', 'create_memory', 'schedule_task', 'learn_instruction', 'ask_agent', 'ask_peer_agent', 'execute_shell']) {
      expect(tools).not.toContain(tool);
    }
    // Still capped by the bot's own settings.
    expect(await botTools({ modules: { notes: true } }, { toolPolicy: 'consult' })).not.toContain('list_emails');
  });

  it('enforces the policies at run time too', () => {
    expect(isToolForbiddenByPolicy('ask_agent', 'federated')).toBe(true);
    expect(isToolForbiddenByPolicy('ask_agent', 'consult')).toBe(true);
    expect(isToolForbiddenByPolicy('send_email', 'consult')).toBe(true);
    expect(isToolForbiddenByPolicy('some_new_tool', 'consult')).toBe(true);
    expect(isToolForbiddenByPolicy('read_email', 'consult')).toBe(false);
    expect(isToolForbiddenByPolicy('ask_agent', undefined)).toBe(false);

    expect(canUseManagerTools({ isAdmin: true, domain: 'chat' })).toBe(true);
    expect(canUseManagerTools({ isAdmin: true, domain: undefined })).toBe(true);
    expect(canUseManagerTools({ isAdmin: false, domain: 'chat' })).toBe(false);
    expect(canUseManagerTools({ isAdmin: true, domain: 'doctor' })).toBe(false);
    expect(canUseManagerTools({ isAdmin: true, domain: 'chat', policy: 'federated' })).toBe(false);
    expect(canUseManagerTools({ isAdmin: true, domain: 'chat', policy: 'consult' })).toBe(false);
    expect(canUseFederationTools({ isAdmin: true, domain: 'doctor', policy: 'consult' })).toBe(false);
  });
});
