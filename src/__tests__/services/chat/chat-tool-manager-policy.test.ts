/**
 * @jest-environment node
 *
 * Multi-bot PR 7: ask_agent at run time. The model can name a tool it was not
 * offered, so the runner checks the flag, the caller and the policy again.
 */
jest.mock('@/app/services/skills/skills.service', () => ({ skillsService: { getSkillTools: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/app/services/agent/agent-tool-settings.repository', () => ({
  loadAgentToolSettings: jest.fn().mockResolvedValue({ modules: {}, tools: {}, skills: {} }),
}));
jest.mock('@/app/actions/instagram', () => ({ generateCaption: jest.fn(), generateTags: jest.fn() }));
jest.mock('@/app/tools/instagram.tool', () => ({ InstagramTool: jest.fn() }));
jest.mock('@/federation/federation-client.instance', () => ({ federationClient: {} }));
const mockAskAgent = jest.fn();
jest.mock('@/app/services/agent/bot-consult', () => ({ askAgent: (...args: unknown[]) => mockAskAgent(...args) }));
jest.mock('@/app/services/agent/bot-consult.repository', () => ({ botConsultRepository: {} }));
jest.mock('@/app/services/agent/unit-agents.repository', () => ({ getUnitAgent: jest.fn(), listUnitAgents: jest.fn() }));
const mockExecuteChatMessage = jest.fn();
jest.mock('@/app/services/chat/chat-execution.service', () => ({ executeChatMessage: (input: unknown) => mockExecuteChatMessage(input) }));
jest.mock('@/federation/unit-profile.repository', () => ({ loadUnitProfile: jest.fn(async () => ({ displayName: 'Napols' })) }));

import { executeChatTool } from '@/app/services/chat/chat-tool-runner';

const admin = { id: 'admin-1', email: 'a@example.com', name: 'A', is_admin: true, created_at: new Date() };
const ctx = (patch: Record<string, unknown> = {}) => ({
  user: admin, githubToken: '', message: 'm', locale: 'pt', emit: jest.fn(), domain: 'chat',
  conversationId: 'manager-conv', modelId: 'gpt-4o', provider: 'github', turn: { consults: 0 }, ...patch,
});
const args = { agent: 'doctor', question: 'q' };

describe('ask_agent in the tool runner', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ALLERAC_BOTS = 'true';
    mockAskAgent.mockResolvedValue({ agent: 'doctor', answer: 'a' });
  });
  afterEach(() => { process.env = { ...env }; });

  it('runs for the default agent of an admin, with the Manager context', async () => {
    expect(await executeChatTool('ask_agent', args, ctx())).toEqual({ agent: 'doctor', answer: 'a' });
    const [toolArgs, consultCtx, deps] = mockAskAgent.mock.calls[0];
    expect(toolArgs).toEqual(args);
    expect(consultCtx).toMatchObject({
      callerConversationId: 'manager-conv', model: { modelId: 'gpt-4o', provider: 'github' }, locale: 'pt', managerName: 'Napols',
    });

    // The bot turn runs as the bot, in its own domain, with the consult policy.
    mockExecuteChatMessage.mockResolvedValue({ content: 'hi', events: [] });
    const bot = { slug: 'doctor' };
    await deps.run({ user: admin, conversationId: 'h1', bot, message: 'x', modelId: 'm', provider: 'ollama', locale: 'pt' });
    expect(mockExecuteChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      domain: 'doctor', conversationId: 'h1', toolPolicy: 'consult', bot,
    }));
  });

  it('refuses with the flag off, for non-admins, bots, other domains and federated or consult turns', async () => {
    const refusals = [
      ctx({ user: { ...admin, is_admin: false } }),
      ctx({ domain: 'doctor' }),
      ctx({ domain: 'health' }),
      ctx({ toolPolicy: 'federated' }),
      ctx({ toolPolicy: 'consult' }),
    ];
    for (const context of refusals) {
      expect(await executeChatTool('ask_agent', args, context)).toEqual({ error: expect.stringContaining('not available') });
    }
    delete process.env.ALLERAC_BOTS;
    expect(await executeChatTool('ask_agent', args, ctx())).toEqual({ error: 'Tool ask_agent is not available.' });
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('blocks write tools for a consulted bot at run time', async () => {
    for (const tool of ['send_email', 'create_memory', 'save_note', 'schedule_task', 'create_job']) {
      expect(await executeChatTool(tool, {}, ctx({ domain: 'doctor', toolPolicy: 'consult' })))
        .toEqual({ error: expect.stringContaining('not available') });
    }
  });
});
