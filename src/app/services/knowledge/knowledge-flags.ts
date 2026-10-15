/**
 * Feature flags for the unified knowledge search (Phase 3). Both default to
 * on; set the variable to 'false' to fall back to the previous behaviour.
 *
 * - KNOWLEDGE_UNIFIED_RECALL: recall_memory / search_memory use the semantic
 *   memory index (with lexical matching) instead of keyword-only search.
 * - KNOWLEDGE_UNIFIED_RAG: chat auto-RAG injects notes, documents and
 *   memories from the unified search instead of document chunks only.
 */
export function isUnifiedRecallEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KNOWLEDGE_UNIFIED_RECALL !== 'false';
}

export function isUnifiedRagEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KNOWLEDGE_UNIFIED_RAG !== 'false';
}
