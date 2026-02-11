'use server';

import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';

export async function getRelevantContext(query: string, userId: string, githubToken: string) {
    console.log('[RAG] getRelevantContext called:', { query: query.substring(0, 50), userId, hasToken: !!githubToken });

    try {
        const embeddingService = new EmbeddingService(githubToken);
        const vectorService = new VectorSearchService(embeddingService);
        const result = await vectorService.getRelevantContext(query, userId);
        console.log('[RAG] Context found:', result.substring(0, 100) + '...');
        return result;
    } catch (error: any) {
        console.error('[RAG] Error getting context:', error.message);
        throw error;
    }
}
