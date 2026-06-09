'use server';

import { DocumentService } from '@/app/services/rag/document.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();
const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

async function getEmbeddingToken(userId: string): Promise<string> {
    const [settings, systemSettings] = await Promise.all([
        userSettingsService.loadUserSettings(userId),
        systemSettingsService.loadAll(),
    ]);
    return settings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN || '';
}

function requireValidDocument(file: File | null): File {
    if (!file) throw new Error('No file provided');
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        throw new Error('Document is too large. Maximum size is 20 MB.');
    }
    return file;
}

/**
 * Uploads a document and starts processing asynchronously.
 * Returns immediately after creating the document record.
 * The document will be in 'processing' status until embeddings are generated.
 */
export async function uploadDocument(formData: FormData, domainSlug?: string | null) {
    const user = await requireCurrentUser();
    if (domainSlug) await assertDomainAccess(user, domainSlug);

    const file = requireValidDocument(formData.get('file') as File | null);

    const embeddingService = new EmbeddingService(await getEmbeddingToken(user.id));
    const docService = new DocumentService(embeddingService);

    // Step 1: Create document record
    const documentId = await docService.createDocumentRecord(file, user.id, domainSlug);

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
export async function processDocument(formData: FormData) {
    const user = await requireCurrentUser();

    const file = requireValidDocument(formData.get('file') as File | null);

    const embeddingService = new EmbeddingService(await getEmbeddingToken(user.id));
    const docService = new DocumentService(embeddingService);
    return await docService.processDocument(file, user.id);
}

export async function getAllDocuments(domainSlug?: string | null) {
    const user = await requireCurrentUser();
    if (domainSlug) await assertDomainAccess(user, domainSlug);

    const embeddingService = new EmbeddingService(await getEmbeddingToken(user.id));
    const docService = new DocumentService(embeddingService);
    return await docService.getAllDocuments(user.id, domainSlug);
}

export async function deleteDocument(documentId: string) {
    const user = await requireCurrentUser();

    const embeddingService = new EmbeddingService(await getEmbeddingToken(user.id));
    const docService = new DocumentService(embeddingService);
    return await docService.deleteDocument(documentId, user.id);
}
