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
const {
  listAgentCapabilities,
  normalizeAgentToolSettings,
  resolveAgentToolAccess,
} = require('@/app/services/agent/agent-tool-settings');
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedGetSkillTools = skillsService.getSkillTools as jest.Mock;
const names = (tools: Array<{ function: { name: string } }>) => tools.map((tool) => tool.function.name);
const settings = (partial: Partial<AgentToolSettings> = {}): AgentToolSettings => ({
  modules: {}, tools: {}, skills: {}, ...partial,
});

describe('chat agent tool assembly (phase 3a)', () => {
  beforeEach(() => {
    mockedGetSkillTools.mockReset().mockResolvedValue([]);
    mockLoadSettings.mockReset().mockResolvedValue(settings());
  });

  it('gives the chat agent the tools of every capability on by default', async () => {
    const tools = names(await resolveChatTools('chat-skill', 'chat'));
    expect(tools).toEqual(expect.arrayContaining([
      'get_health_summary', 'list_emails', 'send_email', 'save_note', 'list_jobs',
      'search_memory', 'delete_memory', 'recall_memory', 'create_memory', 'schedule_task',
    ]));
    // Heavy modules and tickets default off.
    expect(tools).not.toContain('get_top_tracks');
    expect(tools).not.toContain('instagram_publish_post');
    expect(tools).not.toContain('list_tickets');
    expect(new Set(tools).size).toBe(tools.length);
  });

  it('loads the stored settings when none are passed', async () => {
    mockLoadSettings.mockResolvedValueOnce(settings({ modules: { health: false } }));
    const tools = names(await resolveChatTools(null, 'chat'));
    expect(mockLoadSettings).toHaveBeenCalled();
    expect(tools).not.toContain('get_health_summary');
  });

  it('honours module, tool and skill toggles', async () => {
    const tools = names(await resolveChatTools(null, 'chat', {
      agentToolSettings: settings({ modules: { music: true, email: false, tickets: true }, tools: { delete_note: false } }),
    }));
    expect(tools).toContain('get_top_tracks');
    expect(tools).toContain('list_tickets');
    expect(tools).not.toContain('list_emails');
    expect(tools).not.toContain('delete_note');
    expect(tools).toContain('save_note');
  });

  it('never offers tools of modules disabled by ALLERAC_MODULES', () => {
    const capabilities = listAgentCapabilities({ ALLERAC_MODULES: 'email' }).map((c: { id: string }) => c.id);
    expect(capabilities).toContain('email');
    expect(capabilities).not.toContain('health');
    expect(capabilities).not.toContain('music');
    const access = resolveAgentToolAccess(settings({ modules: { health: true } }), { ALLERAC_MODULES: 'email' });
    expect(access.enabledTools.has('get_health_summary')).toBe(false);
  });

  it('limits capability tools to the active skill tool list', async () => {
    mockedGetSkillTools.mockResolvedValueOnce(['get_health_summary']);
    const tools = names(await resolveChatTools('health-skill', 'chat', { agentToolSettings: settings() }));
    expect(tools).toContain('get_health_summary');
    expect(tools).not.toContain('list_emails');
    expect(tools).not.toContain('list_jobs');
    expect(tools).toContain('save_note');
    expect(tools).toContain('recall_memory');
  });

  it('keeps other domains unchanged', async () => {
    const email = names(await resolveChatTools(null, 'email', { agentToolSettings: settings({ modules: { email: false } }) }));
    expect(email).toContain('list_emails');
    expect(email).not.toContain('list_jobs');
    const health = names(await resolveChatTools(null, 'health'));
    expect(health).not.toContain('list_emails');
    expect(mockLoadSettings).not.toHaveBeenCalled();
    expect(await resolveChatTools(null, 'alleracweb')).toEqual([]);
  });

  it('keeps the reach of paired Units unchanged (federated chat agent)', async () => {
    const tools = names(await resolveChatTools(null, 'chat', {
      toolPolicy: 'federated', allowShell: true, allowFederation: true,
      agentToolSettings: settings({ modules: { tickets: true } }),
    }));
    expect(tools).toContain('save_note');
    expect(tools).toContain('recall_memory');
    for (const forbidden of ['list_emails', 'send_email', 'list_jobs', 'create_job', 'list_tickets',
      'search_memory', 'delete_memory', 'create_memory', 'schedule_task', 'learn_instruction',
      'execute_shell', 'ask_peer_agent']) {
      expect(tools).not.toContain(forbidden);
    }
  });

  it('disables the skills of capabilities that are off', () => {
    const access = resolveAgentToolAccess(settings({ modules: { notes: false }, skills: { health: false } }));
    expect(access.disabledSkills).toEqual(new Set(['health', 'music', 'social', 'notes', 'tickets']));
  });
});

describe('normalizeAgentToolSettings', () => {
  it('drops unknown keys and non-boolean values', () => {
    expect(normalizeAgentToolSettings({
      modules: { health: false, nope: true, email: 'yes' },
      tools: { save_note: false, rm_rf: false },
      skills: { music: true },
      extra: 1,
    })).toEqual({ modules: { health: false }, tools: { save_note: false }, skills: { music: true } });
    expect(normalizeAgentToolSettings(null)).toEqual({ modules: {}, tools: {}, skills: {} });
  });
});
