/**
 * Conversations that never feed long-term memory or RAG:
 * - source = 'federation': they answer a paired Unit (federation P4 decision 1);
 * - source = 'handoff': the Manager consulted a bot (multi-bot PR 7).
 * They stay in chat history. New summaries are already blocked at creation;
 * this filter also covers summaries created before migration 146.
 *
 * `alias` is the conversation_summaries alias (or table name) in the query.
 */
export const NON_MEMORY_SOURCES = ['federation', 'handoff'] as const;

const SOURCES_SQL = NON_MEMORY_SOURCES.map((source) => `'${source}'`).join(', ');

export function notFederatedSummarySql(alias: string): string {
  return `NOT EXISTS (SELECT 1 FROM chat_conversations fed_cc
    WHERE fed_cc.id = ${alias}.conversation_id AND fed_cc.source IN (${SOURCES_SQL}))`;
}

/** SQL predicate on a chat_conversations alias: the conversation may feed memory. */
export function memorySourceSql(alias: string): string {
  return `${alias}.source NOT IN (${SOURCES_SQL})`;
}
