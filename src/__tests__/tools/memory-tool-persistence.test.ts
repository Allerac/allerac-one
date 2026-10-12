/**
 * Regression: a memory created with create_memory must survive a later
 * "Save to memory" (generateConversationSummary) of the same conversation,
 * and must not block automatic summarisation of that conversation.
 */

type SummaryRow = {
  id: string;
  conversation_id: string | null;
  user_id: string;
  summary: string;
  key_topics: string[];
  importance_score: number;
  message_count: number;
  emotion: string | null;
  domain_slug: string | null;
  created_at: string;
};

const store: { summaries: SummaryRow[]; messages: { role: string; content: string }[] } = {
  summaries: [],
  messages: [],
};
let nextId = 1;

function fakeQuery(sql: string, params: unknown[] = []) {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text.startsWith('INSERT INTO conversation_summaries')) {
    const manual = /VALUES \(NULL,/.test(text);
    const row: SummaryRow = manual
      ? {
          id: `mem-${nextId++}`,
          conversation_id: null,
          user_id: params[0] as string,
          summary: params[1] as string,
          key_topics: params[2] as string[],
          importance_score: params[3] as number,
          message_count: 1,
          emotion: params[4] as string | null,
          domain_slug: params[5] as string | null,
          created_at: new Date().toISOString(),
        }
      : {
          id: `mem-${nextId++}`,
          conversation_id: params[0] as string,
          user_id: params[1] as string,
          summary: params[2] as string,
          key_topics: params[3] as string[],
          importance_score: params[4] as number,
          message_count: params[5] as number,
          emotion: params[6] as string | null,
          domain_slug: params[7] as string | null,
          created_at: new Date().toISOString(),
        };
    if (row.conversation_id && text.includes('ON CONFLICT (conversation_id)')) {
      const existing = store.summaries.find((s) => s.conversation_id === row.conversation_id);
      if (existing) {
        Object.assign(existing, { ...row, id: existing.id });
        return Promise.resolve({ rows: [existing], rowCount: 1 });
      }
    }
    store.summaries.push(row);
    return Promise.resolve({ rows: [row], rowCount: 1 });
  }
  if (text.startsWith('SELECT id FROM conversation_summaries WHERE conversation_id = $1')) {
    const rows = store.summaries.filter((s) => s.conversation_id === params[0] && s.user_id === params[1]);
    return Promise.resolve({ rows, rowCount: rows.length });
  }
  if (text.startsWith('SELECT COUNT(*)')) {
    return Promise.resolve({ rows: [{ count: String(store.messages.length) }], rowCount: 1 });
  }
  if (text.startsWith('SELECT cm.role, cm.content')) {
    return Promise.resolve({ rows: store.messages, rowCount: store.messages.length });
  }
  throw new Error(`Unexpected query in test: ${text.slice(0, 80)}`);
}

jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn((sql: string, params?: unknown[]) => fakeQuery(sql, params)) },
}));

jest.mock('@/app/lib/domain-access-check', () => ({
  assertDomainAccess: jest.fn(),
}));

import { buildMemoryTools } from '@/app/tools/memory.tool';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import type { User } from '@/app/services/auth/auth.service';

const user: User = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date(),
};

describe('create_memory persistence', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    store.summaries = [];
    store.messages = [
      { role: 'user', content: 'Remember that I use VS Code.' },
      { role: 'assistant', content: 'Saved.' },
      { role: 'user', content: 'Now help me plan a trip.' },
      { role: 'assistant', content: 'Sure.' },
    ];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"Trip planning chat","key_topics":["travel"],"importance_score":5}' } }],
      }),
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('stores a standalone memory without forced topics', async () => {
    const tools = buildMemoryTools({ user, conversationId: 'conv-1', callerDomain: 'chat' });
    const result = await tools.create_memory({ content: '  Gian uses VS Code  ' });

    expect(result.success).toBe(true);
    expect(store.summaries).toHaveLength(1);
    expect(store.summaries[0]).toMatchObject({
      conversation_id: null,
      summary: 'Gian uses VS Code',
      key_topics: [],
      domain_slug: 'chat',
      importance_score: 7,
    });
  });

  test('keeps model-provided topics, normalised and deduplicated', async () => {
    const tools = buildMemoryTools({ user, conversationId: 'conv-1', callerDomain: 'chat' });
    await tools.create_memory({ content: 'Prefers dark mode', topics: ['UI', 'ui ', '', 42 as unknown as string] });
    expect(store.summaries[0].key_topics).toEqual(['ui']);
  });

  test('rejects empty content', async () => {
    const tools = buildMemoryTools({ user, conversationId: 'conv-1', callerDomain: 'chat' });
    const result = await tools.create_memory({ content: '   ' });
    expect(result.success).toBe(false);
    expect(store.summaries).toHaveLength(0);
  });

  test('save to memory after create_memory keeps both memories', async () => {
    const tools = buildMemoryTools({ user, conversationId: 'conv-1', callerDomain: 'chat' });
    await tools.create_memory({ content: 'Gian uses VS Code' });

    const service = new ConversationMemoryService(
      { endpoint: 'http://llm.test', apiKey: 'k', model: 'm' },
      'chat',
    );
    expect(await service.shouldSummarizeConversation('conv-1', user.id)).toBe(true);

    const summary = await service.generateConversationSummary('conv-1', user.id);
    expect(summary?.summary).toBe('Trip planning chat');

    // Saving again upserts the conversation summary but never touches the manual memory.
    await service.generateConversationSummary('conv-1', user.id);

    expect(store.summaries.map((s) => s.summary).sort()).toEqual(['Gian uses VS Code', 'Trip planning chat']);
    expect(store.summaries.find((s) => s.summary === 'Gian uses VS Code')?.conversation_id).toBeNull();
  });
});
