/**
 * @jest-environment node
 *
 * Phase 4b: the agent chat (surface=agent) may only write to the primary
 * conversation; other surfaces keep writing to any conversation they own.
 */
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(async () => ({ id: 'user-1', is_admin: false })),
  assertDomainAccess: jest.fn(async () => undefined),
  authenticationErrorResponse: jest.fn(() => null),
}));
jest.mock('@/app/services/domains/domain-model-settings.service', () => ({
  domainModelSettingsService: { resolve: jest.fn(async () => ({ modelId: 'gpt-4o', provider: 'github' })) },
}));
jest.mock('@/app/lib/operation-limiter', () => ({
  acquireOperationLimit: jest.fn(() => ({ allowed: false })),
  operationLimitResponse: jest.fn(() => Response.json({ error: 'limited' }, { status: 429 })),
}));
const getConversationForUser = jest.fn();
jest.mock('@/app/services/database/chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({ getConversationForUser: (...args: unknown[]) => getConversationForUser(...args) })),
}));
const getOrCreatePrimaryConversation = jest.fn();
jest.mock('@/app/services/chat/primary-conversation', () => ({
  getOrCreatePrimaryConversation: (...args: unknown[]) => getOrCreatePrimaryConversation(...args),
  acquireConversationLock: jest.fn(),
  loadPrimaryPromptHistory: jest.fn(),
  scheduleCompaction: jest.fn(),
}));
jest.mock('@/app/services/chat/chat-pipeline', () => ({ runChatPipeline: jest.fn() }));
jest.mock('@/app/services/chat/chat-tool-registry', () => ({ PUBLIC_DOMAINS: [], canUseFederationTools: jest.fn(), resolveChatTools: jest.fn() }));
jest.mock('@/app/services/skills/skills.service', () => ({ skillsService: {} }));
jest.mock('@/app/services/chat/chat-skill-resolver', () => ({ resolveActiveChatSkill: jest.fn() }));
jest.mock('@/app/services/knowledge/chat-knowledge-context', () => ({ loadChatKnowledgeContext: jest.fn() }));
jest.mock('@/federation/peer-presence', () => ({ hasActivePeers: jest.fn(), listActivePeerLabels: jest.fn() }));
jest.mock('@/federation/unit-profile.repository', () => ({ loadChatSoulIdentity: jest.fn() }));
jest.mock('@/app/services/chat/chat-image-processor', () => ({ processChatImages: jest.fn() }));
jest.mock('@/app/services/chat/chat-runtime-context', () => ({
  loadChatRuntimeContext: jest.fn(), ChatProviderConfigurationError: class extends Error {},
}));

import { POST } from '@/app/api/chat/route';

const ARCHIVED = '0f8fad5b-d9cb-469f-a165-70867728950e';
const post = (body: Record<string, unknown>) => POST(new Request('http://x/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message: 'hi', model: 'gpt-4o', provider: 'github', domain: 'chat', ...body }),
}));

describe('/api/chat archive rule', () => {
  beforeEach(() => { getConversationForUser.mockReset(); getOrCreatePrimaryConversation.mockReset(); });

  it('rejects writes to a non-primary conversation from the agent chat', async () => {
    getConversationForUser.mockResolvedValue({ id: ARCHIVED, is_primary: false, domain_slug: 'chat' });
    const res = await post({ conversationId: ARCHIVED, surface: 'agent' });
    expect(res.status).toBe(409);
  });

  it('lets other surfaces write to non-primary conversations (passes to the rate limiter)', async () => {
    getConversationForUser.mockResolvedValue({ id: ARCHIVED, is_primary: false, domain_slug: 'chat' });
    const res = await post({ conversationId: ARCHIVED });
    expect(res.status).toBe(429);
    expect(getConversationForUser).not.toHaveBeenCalled();
  });

  it('uses the primary conversation when the agent chat sends no id', async () => {
    getOrCreatePrimaryConversation.mockResolvedValue('primary-id');
    const res = await post({ surface: 'agent' });
    expect(res.status).toBe(429);
    expect(getOrCreatePrimaryConversation).toHaveBeenCalledWith({ userId: 'user-1', domain: 'chat' });
  });

  it('allows the primary conversation from the agent chat', async () => {
    getConversationForUser.mockResolvedValue({ id: ARCHIVED, is_primary: true, domain_slug: 'chat' });
    const res = await post({ conversationId: ARCHIVED, surface: 'agent' });
    expect(res.status).toBe(429);
  });
});
