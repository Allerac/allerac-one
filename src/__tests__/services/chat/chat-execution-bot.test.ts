/**
 * @jest-environment node
 *
 * Multi-bot PR 7: executeChatMessage runs a consulted bot as that bot (its
 * soul, explicit tools, memory scope), with the read-only consult policy.
 */
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
const mockGetConversation = jest.fn();
jest.mock('@/app/services/database/chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    getConversationForUser: (...args: unknown[]) => mockGetConversation(...args),
    loadMessages: jest.fn(async () => []),
    saveMessage: jest.fn(async () => ({ success: true })),
  })),
}));
jest.mock('@/app/services/chat/primary-conversation', () => ({
  acquireConversationLock: jest.fn(), loadPrimaryPromptHistory: jest.fn(), scheduleCompaction: jest.fn(),
}));
jest.mock('@/app/services/chat/segment-summarizer', () => ({ makeSegmentSummarizer: jest.fn() }));
const mockKnowledge = jest.fn();
jest.mock('@/app/services/knowledge/chat-knowledge-context', () => ({ loadChatKnowledgeContext: (input: unknown) => mockKnowledge(input) }));
const mockChatSoul = jest.fn();
jest.mock('@/federation/unit-profile.repository', () => ({
  loadChatSoulIdentity: (...args: unknown[]) => mockChatSoul(...args),
  loadUnitProfile: jest.fn(async () => ({ name: 'napols', displayName: 'Napols' })),
}));
jest.mock('@/app/services/agent/unit-agents.repository', () => ({ listUnitAgents: jest.fn(async () => []) }));
jest.mock('@/app/services/skills/skills.service', () => ({ skillsService: { completeSkillUsage: jest.fn() } }));
const mockResolveTools = jest.fn();
jest.mock('@/app/services/chat/chat-tool-registry', () => ({
  PUBLIC_DOMAINS: ['alleracweb', 'openworld'],
  canUseFederationTools: jest.fn(() => true),
  resolveChatTools: (...args: unknown[]) => mockResolveTools(...args),
}));
jest.mock('@/federation/peer-presence', () => ({ hasActivePeers: jest.fn(async () => true), listActivePeerLabels: jest.fn() }));
jest.mock('@/app/lib/shell-policy', () => ({ isShellAllowedFor: jest.fn(() => true) }));
const mockResolveSkill = jest.fn();
jest.mock('@/app/services/chat/chat-skill-resolver', () => ({ resolveActiveChatSkill: (input: unknown) => mockResolveSkill(input) }));
const mockPipeline = jest.fn();
jest.mock('@/app/services/chat/chat-pipeline', () => ({ runChatPipeline: (input: unknown) => mockPipeline(input) }));
jest.mock('@/app/services/chat/chat-runtime-context', () => ({ loadChatRuntimeContext: jest.fn(async () => ({ timezone: 'UTC' })) }));
jest.mock('@/app/services/chat/chat-image-processor', () => ({ processChatImages: jest.fn(async () => null) }));

import { executeChatMessage } from '@/app/services/chat/chat-execution.service';
import type { UnitAgent } from '@/app/services/agent/unit-agents';

const doctor = { slug: 'doctor', displayName: 'Doctor', role: 'your health', description: null, instructions: 'Be careful.',
  isDefault: false, enabled: true, archivedAt: null, memoryMode: 'isolated', shareMemoriesByDefault: false, canCall: [],
  toolSettings: { modules: { health: true }, tools: {}, skills: {} } } as unknown as UnitAgent;
const user = { id: 'admin', is_admin: true, name: 'Gian', email: 'x' } as never;
const run = (patch: Record<string, unknown> = {}) => executeChatMessage({
  user, conversationId: 'h1', domain: 'doctor', message: 'q', modelId: 'qwen2.5:3b', provider: 'ollama', locale: 'pt',
  toolPolicy: 'consult', bot: doctor, ...patch,
});

describe('executeChatMessage as a bot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConversation.mockResolvedValue({ id: 'h1', domain_slug: 'doctor', is_primary: false });
    mockResolveTools.mockResolvedValue([]);
    mockResolveSkill.mockResolvedValue(null);
    mockKnowledge.mockResolvedValue('');
    mockPipeline.mockResolvedValue('answer');
  });

  it('uses the bot soul, explicit tools, memory scope and the consult policy', async () => {
    expect((await run()).content).toBe('answer');
    const [, domain, options] = mockResolveTools.mock.calls[0];
    expect(domain).toBe('doctor');
    expect(options).toMatchObject({ bot: true, allowShell: false, allowFederation: false, toolPolicy: 'consult' });
    expect(options.agentToolSettings.modules).toMatchObject({ health: true, email: false, notes: false });
    expect(options).not.toHaveProperty('allowManager');
    expect(mockResolveSkill.mock.calls[0][0].agentToolSettings.modules.health).toBe(true);
    expect(mockKnowledge.mock.calls[0][0]).toMatchObject({ domainSlug: 'doctor', includeShared: true, memories: true });
    expect(mockChatSoul).not.toHaveBeenCalled();
    const pipeline = mockPipeline.mock.calls[0][0];
    expect(pipeline).toMatchObject({ domain: 'doctor', toolPolicy: 'consult', modelId: 'qwen2.5:3b' });
    expect(pipeline.messages[0].content).toContain('You are Doctor, one of the assistants of Napols');
  });

  it('refuses to run a bot outside its own domain', async () => {
    mockGetConversation.mockResolvedValue({ id: 'h1', domain_slug: 'chat', is_primary: false });
    await expect(run({ domain: 'chat' })).rejects.toThrow('domain of that bot');
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('keeps the default path without a bot', async () => {
    mockGetConversation.mockResolvedValue({ id: 'c1', domain_slug: 'chat', is_primary: false });
    mockChatSoul.mockResolvedValue({ displayName: 'Napols' });
    await run({ conversationId: 'c1', domain: 'chat', bot: undefined, toolPolicy: 'federated' });
    expect(mockResolveTools.mock.calls[0][2]).toEqual({ allowShell: true, toolPolicy: 'federated', allowFederation: true });
    expect(mockChatSoul).toHaveBeenCalled();
  });
});
