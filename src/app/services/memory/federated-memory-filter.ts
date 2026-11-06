/**
 * Federated conversations (chat_conversations.source = 'federation') answer a
 * paired Unit. They stay in chat history but never feed long-term memory or
 * RAG (federation P4 decision 1). New summaries are already blocked at
 * creation; this filter also covers summaries created before migration 146.
 *
 * `alias` is the conversation_summaries alias (or table name) in the query.
 */
export function notFederatedSummarySql(alias: string): string {
  return `NOT EXISTS (SELECT 1 FROM chat_conversations fed_cc
    WHERE fed_cc.id = ${alias}.conversation_id AND fed_cc.source = 'federation')`;
}
