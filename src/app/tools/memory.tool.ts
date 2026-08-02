import pool from '@/app/clients/db';
import { assertDomainAccess } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';

export { MEMORY_DOMAIN_TOOL_DEFINITIONS, RECALL_MEMORY_TOOL_DEFINITION } from './memory.tool.definitions';

interface MemoryToolContext {
  user: User;
  conversationId: string;
  callerDomain: string;
}

function clampLimit(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(parsed)));
}

async function ensureDomainAccess(user: User, domainSlug: string | undefined): Promise<void> {
  if (domainSlug) await assertDomainAccess(user, domainSlug);
}

async function searchMemories(
  user: User,
  query: string,
  domainSlug: string | undefined,
  limit: number,
) {
  await ensureDomainAccess(user, domainSlug);
  const pattern = `%${query.trim()}%`;
  const result = domainSlug
    ? await pool.query(
        `SELECT id, summary, key_topics, importance_score, emotion, domain_slug, created_at
         FROM conversation_summaries
         WHERE user_id = $1
           AND domain_slug = $2
           AND (summary ILIKE $3 OR array_to_string(key_topics, ' ') ILIKE $3)
         ORDER BY importance_score DESC, created_at DESC
         LIMIT $4`,
        [user.id, domainSlug, pattern, limit],
      )
    : user.is_admin
      ? await pool.query(
        `SELECT id, summary, key_topics, importance_score, emotion, domain_slug, created_at
         FROM conversation_summaries
         WHERE user_id = $1
           AND (summary ILIKE $2 OR array_to_string(key_topics, ' ') ILIKE $2)
         ORDER BY importance_score DESC, created_at DESC
         LIMIT $3`,
        [user.id, pattern, limit],
      )
      : await pool.query(
        `SELECT cs.id, cs.summary, cs.key_topics, cs.importance_score, cs.emotion, cs.domain_slug, cs.created_at
         FROM conversation_summaries cs
         WHERE cs.user_id = $1
           AND (cs.summary ILIKE $2 OR array_to_string(cs.key_topics, ' ') ILIKE $2)
           AND (
             cs.domain_slug IS NULL
             OR EXISTS (
               SELECT 1
               FROM user_domain_access uda
               JOIN domains d ON d.id = uda.domain_id
               WHERE uda.user_id = $1 AND d.slug = cs.domain_slug AND d.is_active = true
             )
           )
         ORDER BY cs.importance_score DESC, cs.created_at DESC
         LIMIT $3`,
        [user.id, pattern, limit],
      );
  return { memories: result.rows };
}

export function buildMemoryTools({ user, conversationId, callerDomain }: MemoryToolContext) {
  return {
    recall_memory: async (args: { query: string; domain_slug?: string; limit?: number }) => {
      const domainSlug = args.domain_slug?.trim() || callerDomain;
      return searchMemories(user, args.query, domainSlug, clampLimit(args.limit, 5, 20));
    },

    search_memory: async (args: { query: string; domain_slug?: string; limit?: number }) => {
      const domainSlug = args.domain_slug?.trim() || undefined;
      return searchMemories(user, args.query, domainSlug, clampLimit(args.limit, 10, 50));
    },

    create_memory: async (args: { content: string; importance?: number; emotion?: number; domain_slug?: string }) => {
      const domainSlug = args.domain_slug?.trim() || callerDomain;
      await ensureDomainAccess(user, domainSlug);
      const importance = Math.max(1, Math.min(10, Math.trunc(Number(args.importance) || 7)));
      const emotion = [-1, 0, 1].includes(Number(args.emotion)) ? Number(args.emotion) : 0;
      const existing = await pool.query(
        'SELECT id, summary FROM conversation_summaries WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, user.id],
      );

      if (existing.rows[0]) {
        const updated = await pool.query(
          `UPDATE conversation_summaries
           SET summary = summary || E'\n\n' || $1,
               key_topics = ARRAY(SELECT DISTINCT unnest(key_topics || ARRAY['preference', 'correction'])),
               importance_score = $2,
               emotion = $3
           WHERE id = $4 AND user_id = $5
           RETURNING id, summary, domain_slug`,
          [args.content.trim(), importance, emotion, existing.rows[0].id, user.id],
        );
        return { success: true, memory: updated.rows[0] };
      }

      const inserted = await pool.query(
        `INSERT INTO conversation_summaries
           (user_id, conversation_id, summary, key_topics, importance_score, message_count, emotion, domain_slug)
         SELECT $1, cc.id, $3, ARRAY['preference', 'correction'], $4, 1, $5, $6
         FROM chat_conversations cc
         WHERE cc.id = $2 AND cc.user_id = $1
         RETURNING id, summary, domain_slug`,
        [user.id, conversationId, args.content.trim(), importance, emotion, domainSlug],
      );
      if (!inserted.rows[0]) return { success: false, error: 'Conversation not found' };
      return { success: true, memory: inserted.rows[0] };
    },

    delete_memory: async (args: { memory_id: string }) => {
      const deleted = await pool.query(
        'DELETE FROM conversation_summaries WHERE id = $1 AND user_id = $2 RETURNING id',
        [args.memory_id, user.id],
      );
      return { success: deleted.rowCount === 1, memory_id: args.memory_id };
    },
  };
}
