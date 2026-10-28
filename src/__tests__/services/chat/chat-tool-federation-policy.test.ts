/** @jest-environment node */
jest.mock('@/app/services/skills/skills.service', () => ({
  skillsService: { getSkillTools: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/app/actions/instagram', () => ({ generateCaption: jest.fn(), generateTags: jest.fn() }));
jest.mock('@/app/tools/instagram.tool', () => ({ InstagramTool: jest.fn() }));
const mockListAgents = jest.fn();
const mockAskAgent = jest.fn();
jest.mock('@/federation/federation-client.instance', () => ({
  federationClient: {
    listActivePeers: jest.fn().mockResolvedValue([
      { id: 'p1', unitName: 'unit2', displayName: null, capabilities: ['federation.agents.list', 'federation.agents.ask'] },
    ]),
    findActivePeer: jest.fn().mockResolvedValue({ id: 'p1', unitName: 'unit2' }),
    listAgents: (...args: unknown[]) => mockListAgents(...args),
    askAgent: (...args: unknown[]) => mockAskAgent(...args),
  },
}));

import {
  FEDERATED_FORBIDDEN_TOOL_NAMES,
  canUseFederationTools,
  resolveChatTools,
} from '@/app/services/chat/chat-tool-registry';
import { executeChatTool } from '@/app/services/chat/chat-tool-runner';

const names = (tools: Array<{ function: { name: string } }>) => tools.map(tool => tool.function.name);
const user = { id: 'admin-1', email: 'a@example.com', name: 'A', is_admin: true, created_at: new Date() };
const ctx = { user, githubToken: '', message: 'm', locale: 'en', emit: jest.fn(), domain: 'chat' };

describe('federation tool policy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers federation tools only when explicitly allowed', async () => {
    expect(names(await resolveChatTools(undefined, 'chat'))).not.toContain('ask_peer_agent');
    expect(names(await resolveChatTools(undefined, 'chat', { allowFederation: true })))
      .toEqual(expect.arrayContaining(['list_peer_agents', 'ask_peer_agent']));
    expect(names(await resolveChatTools(undefined, 'sales', { allowFederation: true }))).not.toContain('ask_peer_agent');
  });

  it('decides eligibility on admin, domain and policy', () => {
    expect(canUseFederationTools({ isAdmin: true, domain: 'chat' })).toBe(true);
    expect(canUseFederationTools({ isAdmin: false, domain: 'chat' })).toBe(false);
    expect(canUseFederationTools({ isAdmin: true, domain: 'sales' })).toBe(false);
    expect(canUseFederationTools({ isAdmin: true, domain: 'openworld' })).toBe(false);
    expect(canUseFederationTools({ isAdmin: true, domain: 'chat', policy: 'federated' })).toBe(false);
  });

  it('strips restricted tools under the federated policy', async () => {
    const tools = names(await resolveChatTools(undefined, 'chat', {
      allowShell: true, allowFederation: true, toolPolicy: 'federated',
    }));
    for (const forbidden of FEDERATED_FORBIDDEN_TOOL_NAMES) expect(tools).not.toContain(forbidden);
    expect(tools).toContain('save_note');
  });

  it('the runner re-checks the federated policy', async () => {
    for (const tool of ['create_memory', 'schedule_task', 'learn_instruction', 'execute_shell', 'ask_peer_agent']) {
      const result = await executeChatTool(tool, {}, { ...ctx, toolPolicy: 'federated' });
      expect(result).toEqual({ error: expect.stringContaining('not available') });
    }
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('the runner refuses federation tools for non-admins and public domains', async () => {
    const asUser = await executeChatTool('ask_peer_agent', { peer: 'unit2', agent: 'health', question: 'q' },
      { ...ctx, user: { ...user, is_admin: false } });
    const inSales = await executeChatTool('list_peer_agents', {}, { ...ctx, domain: 'sales' });
    expect(asUser).toEqual({ error: expect.stringContaining('not available') });
    expect(inSales).toEqual({ error: expect.stringContaining('not available') });
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockListAgents).not.toHaveBeenCalled();
  });

  it('dispatches federation tools for admins', async () => {
    mockListAgents.mockResolvedValue([{ id: 'health', name: 'Health' }]);
    mockAskAgent.mockResolvedValue({ answer: 'Slept well', truncated: false });
    await expect(executeChatTool('list_peer_agents', {}, ctx)).resolves.toEqual({
      units: [{ unit: 'unit2', canAsk: true, agents: [{ id: 'health', name: 'Health' }] }],
    });
    await expect(executeChatTool('ask_peer_agent', { peer: 'unit2', agent: 'health', question: 'Sleep?' }, ctx))
      .resolves.toEqual({ unit: 'unit2', agent: 'health', answer: 'Slept well', truncated: false });
    expect(mockAskAgent).toHaveBeenCalledWith('p1', 'health', 'Sleep?', { initiatedByUserId: 'admin-1' });
  });

  it('validates ask_peer_agent arguments before calling the peer', async () => {
    await expect(executeChatTool('ask_peer_agent', { peer: 'unit2', agent: 'health', question: 'x'.repeat(4001) }, ctx))
      .resolves.toEqual({ error: expect.stringContaining('too long') });
    await expect(executeChatTool('ask_peer_agent', { peer: 'unit2' }, ctx))
      .resolves.toEqual({ error: expect.stringContaining('required') });
    expect(mockAskAgent).not.toHaveBeenCalled();
  });
});
