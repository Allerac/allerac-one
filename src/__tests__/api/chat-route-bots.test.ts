/**
 * @jest-environment node
 *
 * Multi-bot PR 2: a chat request whose domain is a bot of this Unit runs as
 * that bot (admin only), with the bot's tools, soul and model rules. The
 * default `chat` agent and legacy domains keep their path.
 */
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
const mockUser = jest.fn();
const mockAssertDomainAccess = jest.fn();
jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: () => mockUser(),
  assertDomainAccess: (...args: unknown[]) => mockAssertDomainAccess(...args),
  authenticationErrorResponse: jest.fn(() => null),
}));
jest.mock('@/app/services/domains/domain-model-settings.service', () => ({
  domainModelSettingsService: {
    resolve: jest.fn(async () => ({ modelId: 'gpt-4o', provider: 'github', temperature: 0.7, maxTokens: 2000, fallbackModelId: 'gpt-4o-mini' })),
  },
}));
jest.mock('@/app/lib/operation-limiter', () => ({
  acquireOperationLimit: jest.fn(() => ({ allowed: true, headers: {}, lease: { release: jest.fn() } })),
  operationLimitResponse: jest.fn(),
}));
jest.mock('@/app/services/database/chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    createConversation: jest.fn(async () => 'conv-1'),
    getConversationForUser: jest.fn(),
    saveMessage: jest.fn(async () => ({ success: true })),
    loadMessages: jest.fn(async () => []),
  })),
}));
jest.mock('@/app/services/chat/primary-conversation', () => ({
  getOrCreatePrimaryConversation: jest.fn(), acquireConversationLock: jest.fn(),
  loadPrimaryPromptHistory: jest.fn(), scheduleCompaction: jest.fn(),
}));
const mockPipeline = jest.fn();
jest.mock('@/app/services/chat/chat-pipeline', () => ({ runChatPipeline: (input: unknown) => mockPipeline(input) }));
const mockResolveTools = jest.fn();
const mockCanUseFederation = jest.fn();
jest.mock('@/app/services/chat/chat-tool-registry', () => ({
  PUBLIC_DOMAINS: ['alleracweb', 'openworld'],
  canUseFederationTools: (...args: unknown[]) => mockCanUseFederation(...args),
  resolveChatTools: (...args: unknown[]) => mockResolveTools(...args),
}));
jest.mock('@/app/services/skills/skills.service', () => ({ skillsService: {} }));
const mockResolveSkill = jest.fn();
jest.mock('@/app/services/chat/chat-skill-resolver', () => ({ resolveActiveChatSkill: (input: unknown) => mockResolveSkill(input) }));
jest.mock('@/app/services/knowledge/chat-knowledge-context', () => ({ loadChatKnowledgeContext: jest.fn(async () => '') }));
jest.mock('@/federation/peer-presence', () => ({ hasActivePeers: jest.fn(async () => true), listActivePeerLabels: jest.fn() }));
const mockLoadChatSoulIdentity = jest.fn();
jest.mock('@/federation/unit-profile.repository', () => ({
  loadChatSoulIdentity: (...args: unknown[]) => mockLoadChatSoulIdentity(...args),
  loadUnitProfile: jest.fn(async () => ({
    name: 'napols', displayName: 'Napols', emoji: null, role: null, description: null,
    tags: [], agentDescriptions: {}, identityInPublicDomains: false, instructions: null,
  })),
}));
jest.mock('@/app/services/chat/chat-image-processor', () => ({ processChatImages: jest.fn(async () => null) }));
jest.mock('@/app/services/chat/chat-runtime-context', () => ({
  loadChatRuntimeContext: jest.fn(async () => ({ timezone: 'UTC' })), ChatProviderConfigurationError: class extends Error {},
}));
jest.mock('@/app/lib/shell-access', () => ({ isShellAllowedFor: jest.fn(() => true) }));
const mockGetUnitAgent = jest.fn();
jest.mock('@/app/services/agent/unit-agents.repository', () => ({
  getUnitAgent: (slug: string) => mockGetUnitAgent(slug),
  listUnitAgents: jest.fn(async () => []),
}));

import { POST } from '@/app/api/chat/route';
import type { UnitAgent } from '@/app/services/agent/unit-agents';

const doctor = (patch: Partial<UnitAgent> = {}): UnitAgent => ({
  id: 'id', slug: 'doctor', displayName: 'Gian Doctor', emoji: null, avatarUrl: null, role: 'your health',
  description: null, instructions: 'Be careful.', isDefault: false, enabled: true, sortOrder: 0,
  toolSettings: { modules: { health: true }, tools: {}, skills: {} }, memoryMode: 'isolated', shareMemoriesByDefault: false, canCall: [],
  modelId: null, modelProvider: null, cloudAllowed: true, defaultSkillId: null, federationExposed: false,
  template: null, archivedAt: null, createdAt: null, updatedAt: null, ...patch,
});

const post = (domain: string) => POST(new Request('http://x/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message: 'hi', model: 'gpt-4o', provider: 'github', domain }),
}));
const drain = async (response: Response) => response.text();

describe('/api/chat with bots', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.ALLERAC_BOTS = 'true';
    mockUser.mockResolvedValue({ id: 'admin-1', is_admin: true, name: 'Gian' });
    mockAssertDomainAccess.mockReset().mockResolvedValue(undefined);
    mockGetUnitAgent.mockReset().mockResolvedValue(null);
    mockResolveTools.mockReset().mockResolvedValue([]);
    mockCanUseFederation.mockReset().mockReturnValue(true);
    mockResolveSkill.mockReset().mockResolvedValue(null);
    mockPipeline.mockReset().mockResolvedValue('answer');
    mockLoadChatSoulIdentity.mockReset().mockResolvedValue({ displayName: 'Napols' });
  });
  afterEach(() => { process.env = { ...env }; });

  it('runs a bot turn with its tools, soul and no federation or shell', async () => {
    mockGetUnitAgent.mockResolvedValue(doctor());
    const response = await post('doctor');
    expect(response.status).toBe(200);
    await drain(response);

    expect(mockAssertDomainAccess).not.toHaveBeenCalled();
    const [, domain, options] = mockResolveTools.mock.calls[0];
    expect(domain).toBe('doctor');
    expect(options).toMatchObject({ bot: true, allowShell: false, allowFederation: false });
    expect(options.agentToolSettings.modules).toMatchObject({ health: true, notes: false });
    expect(mockResolveSkill.mock.calls[0][0].agentToolSettings.modules.health).toBe(true);
    expect(mockLoadChatSoulIdentity).not.toHaveBeenCalled();

    const pipeline = mockPipeline.mock.calls[0][0];
    expect(pipeline.domain).toBe('doctor');
    expect(pipeline.fallbackModelId).toBeNull();
    expect(pipeline.messages[0].content).toContain('You are Gian Doctor, one of the assistants of Napols');
  });

  it('uses the bot model and refuses cloud models for local-only bots', async () => {
    mockGetUnitAgent.mockResolvedValue(doctor({ modelId: 'qwen2.5:3b' }));
    await drain(await post('doctor'));
    expect(mockPipeline.mock.calls[0][0]).toMatchObject({ modelId: 'qwen2.5:3b', provider: 'ollama' });

    mockGetUnitAgent.mockResolvedValue(doctor({ cloudAllowed: false }));
    const refused = await post('doctor');
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain('only runs on local models');
  });

  it('refuses non-admins and archived bots', async () => {
    mockGetUnitAgent.mockResolvedValue(doctor());
    mockUser.mockResolvedValueOnce({ id: 'user-1', is_admin: false });
    expect((await post('doctor')).status).toBe(403);

    mockGetUnitAgent.mockResolvedValue(doctor({ archivedAt: '2026-11-27T00:00:00.000Z' }));
    expect((await post('doctor')).status).toBe(409);
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('keeps the default agent path for chat, and every path when the flag is off', async () => {
    await drain(await post('chat'));
    expect(mockGetUnitAgent).not.toHaveBeenCalled();
    expect(mockAssertDomainAccess).toHaveBeenCalledWith(expect.anything(), 'chat');
    expect(mockResolveTools.mock.calls[0][2]).toEqual({ allowShell: true, allowFederation: true });
    expect(mockLoadChatSoulIdentity).toHaveBeenCalled();

    delete process.env.ALLERAC_BOTS;
    mockGetUnitAgent.mockResolvedValue(doctor());
    await drain(await post('doctor'));
    expect(mockGetUnitAgent).not.toHaveBeenCalled();
    expect(mockResolveTools.mock.calls[1][2]).toEqual({ allowShell: true, allowFederation: true });
  });

  it('treats a slug without a bot as the legacy domain path', async () => {
    await drain(await post('health'));
    expect(mockGetUnitAgent).toHaveBeenCalledWith('health');
    expect(mockAssertDomainAccess).toHaveBeenCalledWith(expect.anything(), 'health');
  });
});
