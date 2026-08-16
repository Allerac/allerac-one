'use server';

import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { requireCurrentUser } from '@/app/lib/auth-session';

export async function getRelevantContext(query: string) {
    try {
        const user = await requireCurrentUser();
        const embeddingService = new EmbeddingService();
        const vectorService = new VectorSearchService(embeddingService);
        return await vectorService.getRelevantContext(query, user.id);
    } catch (error: unknown) {
        console.error('[RAG] Error getting context:', error instanceof Error ? error.message : error);
        throw error;
    }
}
