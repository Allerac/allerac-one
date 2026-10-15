/**
 * Chat auto-RAG context. With KNOWLEDGE_UNIFIED_RAG on (default) it injects
 * the top notes, documents and memories of the conversation's domain from the
 * unified knowledge search; otherwise, for public domains, or when the
 * unified search fails or has no embeddings, it uses the previous
 * document-chunk search unchanged.
 *
 * Public domains never get memories: their conversations come from website
 * visitors on a shared service account.
 */

import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { isUnifiedRagEnabled } from './knowledge-flags';
import { formatKnowledgeContext, getKnowledgeSearchService } from './knowledge-search.service';

export const CHAT_RAG_LIMIT = 5;
export const CHAT_RAG_MIN_SIMILARITY = 0.3;
const NO_CONTEXT = 'No relevant documents found in the knowledge base.';

export interface ChatKnowledgeContextInput {
  userId: string;
  isAdmin?: boolean;
  query: string;
  /** Conversation domain, already authorized by the chat route. Null searches accessible domains. */
  domainSlug: string | null;
  publicDomain?: boolean;
}

export async function loadChatKnowledgeContext(input: ChatKnowledgeContextInput): Promise<string> {
  if (isUnifiedRagEnabled() && !input.publicDomain) {
    try {
      const result = await getKnowledgeSearchService().search(
        { id: input.userId, is_admin: input.isAdmin === true },
        input.query,
        { domainSlug: input.domainSlug, limit: CHAT_RAG_LIMIT, minSimilarity: CHAT_RAG_MIN_SIMILARITY },
      );
      if (result.semanticAvailable) {
        return result.hits.length > 0 ? formatKnowledgeContext(result.hits) : NO_CONTEXT;
      }
    } catch (error) {
      console.warn('[KnowledgeRAG] Unified search failed, using document search:', error instanceof Error ? error.message : error);
    }
  }
  const vectorService = new VectorSearchService(new EmbeddingService());
  return vectorService.getRelevantContext(input.query, input.userId, { domainSlug: input.domainSlug });
}
