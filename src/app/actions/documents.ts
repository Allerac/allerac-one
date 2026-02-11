'use server';

import { DocumentService } from '@/app/services/rag/document.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';

/**
 * Uploads a document and starts processing asynchronously.
 * Returns immediately after creating the document record.
 * The document will be in 'processing' status until embeddings are generated.
 */
export async function uploadDocument(formData: FormData, userId: string, githubToken: string) {
    const file = formData.get('file') as File;
    if (!file) throw new Error('No file provided');

    const embeddingService = new EmbeddingService(githubToken);
    const docService = new DocumentService(embeddingService);

    // Step 1: Create document record
    const documentId = await docService.createDocumentRecord(file, userId);

    // Step 2: Extract text from file (needed before we can fire-and-forget)
    const text = await docService.extractTextFromFile(file);

    // Step 3: Fire-and-forget the processing (don't await)
    // This allows the UI to update immediately while processing continues in background
    docService.processDocumentContent(documentId, text).catch((error) => {
        console.error('Background document processing failed:', error);
    });

    // Return immediately with the document ID
    return documentId;
}

/**
 * @deprecated Use uploadDocument for async processing
 * Processes a document synchronously (waits for completion).
 */
export async function processDocument(formData: FormData, userId: string, githubToken: string) {
    const file = formData.get('file') as File;
    if (!file) throw new Error('No file provided');

    const embeddingService = new EmbeddingService(githubToken);
    const docService = new DocumentService(embeddingService);
    return await docService.processDocument(file, userId);
}

export async function getAllDocuments(userId: string, githubToken: string) {
    // DocumentService constructor REQUIRES embeddingService which REQUIRES token.
    const embeddingService = new EmbeddingService(githubToken);
    const docService = new DocumentService(embeddingService);
    return await docService.getAllDocuments(userId);
}

export async function deleteDocument(documentId: string, userId: string, githubToken: string) {
    const embeddingService = new EmbeddingService(githubToken);
    const docService = new DocumentService(embeddingService);
    return await docService.deleteDocument(documentId, userId);
}
