/**
 * @jest-environment node
 *
 * Multi-bot PR 3: memory isolation through the real SQL (lexical and semantic
 * memory search, document search) on a migrated Postgres (migration 159).
 * Enabled with RUN_PG_TESTS=1 and DATABASE_URL.
 *
 * Fixture: one user, bots `pgdoc` (isolated, notes off) and `pgshop`
 * (isolated, notes on), and memories that are private to each bot, shared by
 * a bot, and legacy (written by `chat` before bots existed: shared by default).
 */
import pool from '@/app/clients/db';
import { KnowledgeSearchService } from '@/app/services/knowledge/knowledge-search.service';
import { botMemoryScope, domainMemoryScope } from '@/app/services/memory/memory-scope';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { buildMemoryTools } from '@/app/tools/memory.tool';
import { clearUnitAgentsCache, createUnitAgent, getUnitAgent } from '@/app/services/agent/unit-agents.repository';
import type { UnitAgent } from '@/app/services/agent/unit-agents';
import type { User } from '@/app/services/auth/auth.service';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

// Every vector is the same: the semantic path then returns every row that passes the scope filter.
const VECTOR = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
const fakeEmbeddings = {
  generateEmbedding: async () => ({ embedding: VECTOR }),
  getMetadata: () => ({ version: 'pgtest-v1' }),
} as unknown as ConstructorParameters<typeof KnowledgeSearchService>[0];
const WORD = 'zebrafruit';

describePg('bot memory scope against Postgres', () => {
  const env = { ...process.env };
  let userId: string;
  let user: User;
  let doctor: UnitAgent;
  let shopper: UnitAgent;
  const ids: Record<string, string> = {};

  const memory = async (key: string, domain: string | null, shared: boolean) => {
    const row = await pool.query(
      `INSERT INTO conversation_summaries (conversation_id, user_id, summary, key_topics, importance_score, message_count, domain_slug, shared)
       VALUES (NULL, $1, $2, '{}', 5, 1, $3, $4) RETURNING id`,
      [userId, `${key} ${WORD}`, domain, shared],
    );
    ids[key] = row.rows[0].id;
    await pool.query(
      `INSERT INTO knowledge_semantic_index (user_id, source_type, source_id, content, domain_slug, embedding,
         embedding_provider, embedding_model, embedding_version, content_hash)
       VALUES ($1, 'memory', $2, $3, $4, $5::vector, 'test', 'test', 'pgtest-v1', $6)`,
      [userId, ids[key], `${key} ${WORD}`, domain, `[${VECTOR.join(',')}]`, `hash-${key}`],
    );
  };

  const document = async (key: string, domain: string, shared: boolean) => {
    const row = await pool.query(
      `INSERT INTO documents (filename, file_type, file_size, uploaded_by, status, domain_slug, shared)
       VALUES ($1, 'text/plain', 1, $2, 'completed', $3, $4) RETURNING id`,
      [key, userId, domain, shared],
    );
    ids[key] = row.rows[0].id;
    await pool.query(
      'INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES ($1, 0, $2, $3::vector)',
      [ids[key], `${key} ${WORD}`, `[${VECTOR.join(',')}]`],
    );
  };

  const titles = async (options: Parameters<KnowledgeSearchService['search']>[2]) => {
    const result = await new KnowledgeSearchService(fakeEmbeddings).search({ id: userId, is_admin: true }, WORD, { limit: 25, ...options });
    return result.hits.map((hit) => hit.content.replace(` ${WORD}`, '')).sort();
  };

  beforeAll(async () => {
    process.env.ALLERAC_BOTS = 'true';
    const created = await pool.query(
      `INSERT INTO users (email, name, password_hash, is_admin) VALUES ('pgtest-bots@example.com', 'Bots', 'x', true) RETURNING *`,
    );
    userId = created.rows[0].id;
    user = { ...created.rows[0], is_admin: true } as User;
    clearUnitAgentsCache();
    await createUnitAgent({ slug: 'pgdoc', displayName: 'Doc', memoryMode: 'isolated' }, null);
    await createUnitAgent({ slug: 'pgshop', displayName: 'Shop', memoryMode: 'isolated', toolSettings: { modules: { notes: true } } }, null);
    doctor = (await getUnitAgent('pgdoc'))!;
    shopper = (await getUnitAgent('pgshop'))!;

    await memory('doc-private', 'pgdoc', false);
    await memory('doc-shared', 'pgdoc', true);
    await memory('shop-private', 'pgshop', false);
    await memory('legacy-chat', 'chat', true);
    await memory('legacy-null', null, true);
    await document('docfile-private', 'pgdoc', false);
    await document('shopfile-private', 'pgshop', false);
    await document('unit-file', 'chat', true);
  });

  afterAll(async () => {
    process.env = { ...env };
    await pool.query('DELETE FROM knowledge_semantic_index WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM conversation_summaries WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM documents WHERE uploaded_by = $1', [userId]);
    await pool.query("DELETE FROM unit_agents WHERE slug IN ('pgdoc', 'pgshop')");
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  it('existing rows and default writers are shared (column default)', async () => {
    const legacy = await pool.query('SELECT shared FROM conversation_summaries WHERE id = $1', [ids['legacy-chat']]);
    expect(legacy.rows[0].shared).toBe(true);
  });

  it('an isolated bot reads its own rows plus shared ones, never another bot’s private rows (semantic + lexical)', async () => {
    const scope = botMemoryScope(doctor);
    const read = await titles({ sourceTypes: ['memory'], domainSlug: scope.domainSlug, includeShared: scope.includeShared });
    expect(read).toEqual(['doc-private', 'doc-shared', 'legacy-chat', 'legacy-null']);

    const lexical = await new KnowledgeSearchService({ generateEmbedding: async () => { throw new Error('offline'); } })
      .search({ id: userId, is_admin: true }, WORD, { sourceTypes: ['memory'], domainSlug: 'pgshop', includeShared: true, limit: 25 });
    expect(lexical.semanticAvailable).toBe(false);
    expect(lexical.hits.map((hit) => hit.content.replace(` ${WORD}`, '')).sort())
      .toEqual(['doc-shared', 'legacy-chat', 'legacy-null', 'shop-private']);
  });

  it('the default bot reads everything, private bot rows included (owner decision)', async () => {
    const scope = domainMemoryScope('chat');
    expect(scope.domainSlug).toBeNull();
    expect(await titles({ sourceTypes: ['memory'], domainSlug: scope.domainSlug }))
      .toEqual(['doc-private', 'doc-shared', 'legacy-chat', 'legacy-null', 'shop-private']);
  });

  it('documents follow the same rule', async () => {
    const scope = botMemoryScope(doctor);
    expect(await titles({ sourceTypes: ['document'], domainSlug: scope.domainSlug, includeShared: scope.includeShared }))
      .toEqual(['docfile-private', 'unit-file']);
  });

  it('memory tools ignore a domain_slug argument from a bot and keep its scope', async () => {
    process.env.KNOWLEDGE_UNIFIED_RECALL = 'false';
    const tools = buildMemoryTools({ user, conversationId: 'c', callerDomain: 'pgshop' });
    const result = await tools.recall_memory({ query: WORD, domain_slug: 'pgdoc', limit: 20 });
    const read = result.memories.map((row: { summary: string }) => row.summary.replace(` ${WORD}`, '')).sort();
    expect(read).toEqual(['doc-shared', 'legacy-chat', 'legacy-null', 'shop-private']);
    expect(read).not.toContain('doc-private');
    delete process.env.KNOWLEDGE_UNIFIED_RECALL;
  });

  it('a bot writes private memories by default, shares on request, and deletes only its own rows', async () => {
    clearUnitAgentsCache();
    const tools = buildMemoryTools({ user, conversationId: 'c', callerDomain: 'pgshop' });
    const privateMemory = await tools.create_memory({ content: 'likes oat milk', domain_slug: 'pgdoc' });
    const sharedMemory = await tools.create_memory({ content: 'lives in Barcelona', share_with_unit: true });
    const rows = await pool.query('SELECT id, domain_slug, shared FROM conversation_summaries WHERE id = ANY($1) ORDER BY summary', [[
      privateMemory.memory!.id, sharedMemory.memory!.id,
    ]]);
    expect(rows.rows).toEqual([
      { id: privateMemory.memory!.id, domain_slug: 'pgshop', shared: false },
      { id: sharedMemory.memory!.id, domain_slug: 'pgshop', shared: true },
    ]);

    expect((await tools.delete_memory({ memory_id: ids['doc-private'] })).success).toBe(false);
    expect((await tools.delete_memory({ memory_id: ids['legacy-chat'] })).success).toBe(false);
    expect((await tools.delete_memory({ memory_id: privateMemory.memory!.id })).success).toBe(true);
  });

  it('conversation summaries of a bot are private unless it shares by default', async () => {
    const service = new ConversationMemoryService({ endpoint: '', apiKey: '', model: '' }, 'pgdoc');
    const row = await service.createManualMemory(userId, { content: 'summary of a doctor chat' });
    expect((await pool.query('SELECT shared FROM conversation_summaries WHERE id = $1', [row.id])).rows[0].shared).toBe(false);
    const chatRow = await new ConversationMemoryService({ endpoint: '', apiKey: '', model: '' }, 'chat')
      .createManualMemory(userId, { content: 'summary of a chat' });
    expect((await pool.query('SELECT shared FROM conversation_summaries WHERE id = $1', [chatRow.id])).rows[0].shared).toBe(true);
  });

  it('the default bot row reads all and shares by default after migration 159', async () => {
    const row = await pool.query('SELECT memory_mode, share_memories_by_default FROM unit_agents WHERE is_default');
    expect(row.rows[0]).toEqual({ memory_mode: 'all', share_memories_by_default: true });
    expect(shopper.shareMemoriesByDefault).toBe(false);
  });
});
