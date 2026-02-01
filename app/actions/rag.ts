'use server';

import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';

export async function getRelevantContext(query: string, githubToken: string) {
    const embeddingService = new EmbeddingService(githubToken);
    const vectorService = new VectorSearchService(embeddingService);
    return await vectorService.getRelevantContext(query);
}
