/**
 * @jest-environment node
 *
 * Multi-bot PR 7: hand-off conversations and the consult audit (migration 160)
 * on a migrated Postgres. Enabled with RUN_PG_TESTS=1 and DATABASE_URL.
 */
import pool from '@/app/clients/db';
import { BotConsultRepository } from '@/app/services/agent/bot-consult.repository';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import type { UnitAgent } from '@/app/services/agent/unit-agents';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

describePg('bot consults against Postgres', () => {
  const repo = new BotConsultRepository();
  const bot = { slug: 'pgconsult', displayName: 'PG Consult' } as UnitAgent;
  let userId: string;
  let managerConversation: string;

  const consult = (handoff: string | null, caller = managerConversation) => repo.record({
    userId, callerSlug: 'chat', callerConversationId: caller, targetSlug: bot.slug, handoffConversationId: handoff,
    question: 'q', status: 'ok', errorCode: null, durationMs: 12,
  });
  const addMessages = async (conversationId: string) => {
    for (const [role, content] of [['user', 'a'], ['assistant', 'b'], ['user', 'c'], ['assistant', 'd']]) {
      await pool.query('INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, role, content]);
    }
  };

  beforeAll(async () => {
    const user = await pool.query(
      `INSERT INTO users (email, name, password_hash, is_admin) VALUES ('pgtest-consults@example.com', 'Consults', 'x', true) RETURNING id`,
    );
    userId = user.rows[0].id;
    const conv = await pool.query(
      `INSERT INTO chat_conversations (user_id, title, domain_slug) VALUES ($1, 'Manager', 'chat') RETURNING id`, [userId],
    );
    managerConversation = conv.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bot_consults WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM chat_conversations WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  it('creates hand-off conversations in the bot domain, tagged handoff', async () => {
    const id = await repo.createHandoff(userId, bot, 'Napols · PG Consult');
    const row = await pool.query('SELECT domain_slug, source, title, is_primary FROM chat_conversations WHERE id = $1', [id]);
    expect(row.rows[0]).toEqual({ domain_slug: 'pgconsult', source: 'handoff', title: 'Napols · PG Consult', is_primary: false });
  });

  it('continues the latest hand-off of the same Manager conversation only', async () => {
    expect(await repo.latestHandoff(userId, managerConversation, bot.slug)).toBeNull();
    const first = await repo.createHandoff(userId, bot, 't');
    await consult(first);
    expect(await repo.latestHandoff(userId, managerConversation, bot.slug)).toBe(first);
    expect(await repo.latestHandoff(userId, managerConversation, 'other')).toBeNull();

    // A failed consult without a conversation does not break continuity.
    await consult(null);
    expect(await repo.latestHandoff(userId, managerConversation, bot.slug)).toBe(first);

    // A deleted hand-off conversation is not reused (the audit row stays, with no link).
    await pool.query('DELETE FROM chat_conversations WHERE id = $1', [first]);
    expect(await repo.latestHandoff(userId, managerConversation, bot.slug)).toBeNull();
    const audit = await pool.query('SELECT handoff_conversation_id, status, duration_ms FROM bot_consults WHERE user_id = $1 ORDER BY created_at', [userId]);
    expect(audit.rows).toEqual([
      { handoff_conversation_id: null, status: 'ok', duration_ms: 12 },
      { handoff_conversation_id: null, status: 'ok', duration_ms: 12 },
    ]);
  });

  it('never summarizes a hand-off conversation into memory', async () => {
    const memory = new ConversationMemoryService('github');
    const handoff = await repo.createHandoff(userId, bot, 't');
    await addMessages(handoff);
    expect(await memory.shouldSummarizeConversation(handoff, userId)).toBe(false);

    // Control: the same messages in a local conversation would be summarized.
    const local = await pool.query(
      `INSERT INTO chat_conversations (user_id, title, domain_slug) VALUES ($1, 'Local', 'pgconsult') RETURNING id`, [userId],
    );
    await addMessages(local.rows[0].id);
    expect(await memory.shouldSummarizeConversation(local.rows[0].id, userId)).toBe(true);
  });

  it('rejects unknown statuses', async () => {
    await expect(repo.record({
      userId, callerSlug: 'chat', callerConversationId: null, targetSlug: bot.slug, handoffConversationId: null,
      question: 'q', status: 'weird' as 'ok', errorCode: null, durationMs: 0,
    })).rejects.toThrow();
  });
});
