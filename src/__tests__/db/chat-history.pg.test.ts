/**
 * @jest-environment node
 *
 * Phase 4b (migration 154): keyset paging, archive listing and full-text
 * search scoped to one user. Enabled with RUN_PG_TESTS=1 and DATABASE_URL.
 */
import pool from '@/app/clients/db';
import {
  listArchivedConversations,
  loadMessagePage,
  loadPageAround,
  searchChatHistory,
} from '@/app/services/chat/chat-history.service';
import { getOrCreatePrimaryConversation } from '@/app/services/chat/primary-conversation';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

describePg('chat history against Postgres', () => {
  const users: string[] = [];
  let primary: string;
  let archived: string;

  const makeUser = async (tag: string) => {
    const res = await pool.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'x') RETURNING id`,
      [`history-${tag}-${Date.now()}@example.test`, tag],
    );
    users.push(res.rows[0].id);
    return res.rows[0].id as string;
  };

  beforeAll(async () => {
    const owner = await makeUser('owner');
    const other = await makeUser('other');
    primary = await getOrCreatePrimaryConversation({ userId: owner, domain: 'chat' });
    archived = (await pool.query(
      `INSERT INTO chat_conversations (user_id, title, domain_slug) VALUES ($1, 'Old trip', 'chat') RETURNING id`, [owner],
    )).rows[0].id;
    await pool.query(`INSERT INTO chat_conversations (user_id, title, domain_slug) VALUES ($1, 'Ticket chat', 'tickets')`, [owner]);
    for (let i = 0; i < 120; i++) {
      await pool.query(
        `INSERT INTO chat_messages (conversation_id, role, content, created_at)
         VALUES ($1, $2, $3, NOW() - make_interval(secs => $4))`,
        [primary, i % 2 ? 'assistant' : 'user', i === 10 ? 'remember the zanzibar ferry' : `message ${i}`, 1000 - i],
      );
    }
    await pool.query(`INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'user', 'zanzibar hotel booking')`, [archived]);
    const otherConv = await getOrCreatePrimaryConversation({ userId: other, domain: 'chat' });
    await pool.query(`INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'user', 'zanzibar secret')`, [otherConv]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [users]);
    await pool.end();
  });

  it('pages backwards without gaps or duplicates', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await loadMessagePage(primary, users[0], { before: cursor, limit: 50 });
      seen.unshift(...page.messages.map(m => m.content));
      cursor = page.olderCursor;
    } while (cursor);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect(seen[0]).toBe('message 0');
    expect(seen[119]).toBe('message 119');
  });

  it('never returns another user\'s messages', async () => {
    const page = await loadMessagePage(primary, users[1]);
    expect(page.messages).toEqual([]);
  });

  it('loads the page around a search hit', async () => {
    const hits = await searchChatHistory(users[0], 'zanzibar', { embedQuery: async () => null });
    expect(hits.map(h => h.snippet).join(' ')).not.toContain('secret');
    expect(hits.map(h => h.conversationId).sort()).toEqual([primary, archived].sort());
    const hit = hits.find(h => h.conversationId === primary)!;
    const page = await loadPageAround(primary, users[0], hit.messageId, 20);
    expect(page!.messages.map(m => m.id)).toContain(hit.messageId);
    expect(page!.olderCursor).not.toBeNull();
    expect(page!.newerCursor).not.toBeNull();
  });

  it('lists the archive without the primary and without tooling domains', async () => {
    const archive = await listArchivedConversations(users[0]);
    expect(archive.map(c => c.title)).toEqual(['Old trip']);
  });
});
