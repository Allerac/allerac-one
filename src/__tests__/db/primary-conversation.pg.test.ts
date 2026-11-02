/**
 * @jest-environment node
 *
 * Phase 4a (migration 153): one primary conversation per (user, agent[, principal]),
 * topic markers and the bounded prompt window, on a real migrated Postgres.
 * Enabled with RUN_PG_TESTS=1 and DATABASE_URL.
 */
import pool from '@/app/clients/db';
import {
  getOrCreatePrimaryConversation,
  insertTopicMarker,
  loadPrimaryPromptHistory,
  withConversationLock,
} from '@/app/services/chat/primary-conversation';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

describePg('primary conversation against Postgres', () => {
  let userId: string;

  beforeAll(async () => {
    const res = await pool.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Primary Test', 'x') RETURNING id`,
      [`primary-${Date.now()}@example.test`],
    );
    userId = res.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  it('creates one primary lazily and returns it again, also under concurrency', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => getOrCreatePrimaryConversation({ userId, domain: 'chat' })));
    expect(new Set(ids).size).toBe(1);
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM chat_conversations WHERE user_id = $1 AND is_primary`, [userId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('rejects a second primary for the same user and agent', async () => {
    await getOrCreatePrimaryConversation({ userId, domain: 'chat' });
    await expect(pool.query(
      `INSERT INTO chat_conversations (user_id, title, domain_slug, source, is_primary) VALUES ($1, 'dup', 'chat', 'local', TRUE)`,
      [userId],
    )).rejects.toMatchObject({ code: '23505' });
    // Non-primary conversations are unaffected.
    await pool.query(`INSERT INTO chat_conversations (user_id, title, domain_slug) VALUES ($1, 'old', 'chat')`, [userId]);
  });

  it('keeps context after the latest topic marker only', async () => {
    const id = await getOrCreatePrimaryConversation({ userId, domain: 'chat' });
    await withConversationLock(id, async () => {
      await pool.query(`INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'user', 'before')`, [id]);
    });
    expect(await insertTopicMarker(id, userId)).toBe(true);
    await pool.query(`INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, 'user', 'after')`, [id]);
    const history = await loadPrimaryPromptHistory(id);
    expect(history.map(m => m.content)).toEqual(['after']);
    const all = await pool.query('SELECT COUNT(*)::int AS n FROM chat_messages WHERE conversation_id = $1', [id]);
    expect(all.rows[0].n).toBe(3);
  });
});
