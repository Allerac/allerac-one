'use server';

import { DocumentService } from '@/app/services/rag/document.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';

export async function processDocument(formData: FormData, userId: string, githubToken: string) {
    const file = formData.get('file') as File;
    if (!file) throw new Error('No file provided');

    const embeddingService = new EmbeddingService(githubToken);
    const docService = new DocumentService(embeddingService);
    return await docService.processDocument(file, userId);
}

export async function getAllDocuments(githubToken: string) { // githubToken just for service init if needed, though getAllDocuments might not need it if only DB access
    // DocumentService constructor REQUIRES embeddingService which REQUIRES token.
    // So we must pass a token.
    const embeddingService = new EmbeddingService(githubToken);
    const docService = new DocumentService(embeddingService);
    return await docService.getAllDocuments();
}

export async function deleteDocument(documentId: string, githubToken: string) {
    const embeddingService = new EmbeddingService(githubToken);
    const docService = new DocumentService(embeddingService);
    return await docService.deleteDocument(documentId);
}
