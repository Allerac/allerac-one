import { z } from 'zod';
import { DocumentService } from '@/app/services/rag/document.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { documentDto, resolveEmbeddingToken } from '../_lib/documents';

const listQuerySchema = z.object({
  domainSlug: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('documents:read', request);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid document filters', 400, parsed.error.flatten());
    }

    const token = await resolveEmbeddingToken(user.id);
    const docService = new DocumentService(new EmbeddingService(token));
    const rows = await docService.getAllDocuments(user.id, parsed.data.domainSlug);
    const limited = parsed.data.limit ? rows.slice(0, parsed.data.limit) : rows.slice(0, 50);

    return apiData({ documents: limited.map(documentDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/documents failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('documents:write', request);
    const formData = await request.formData();
    const file = formData.get('file');
    const domainSlug = formData.get('domainSlug');

    if (!file || !(file instanceof File)) {
      return apiError('validation_error', 'file is required', 400);
    }
    if (file.size > 20 * 1024 * 1024) {
      return apiError('validation_error', 'Document is too large. Maximum size is 20 MB.', 400);
    }

    const token = await resolveEmbeddingToken(user.id);
    const docService = new DocumentService(new EmbeddingService(token));

    const documentId = await docService.createDocumentRecord(
      file,
      user.id,
      typeof domainSlug === 'string' ? domainSlug : null,
    );

    const text = await docService.extractTextFromFile(file);
    docService.processDocumentContent(documentId, text).catch(console.error);

    const rows = await docService.getAllDocuments(user.id, typeof domainSlug === 'string' ? domainSlug : null);
    const row = rows.find((r: any) => r.id === documentId);

    return apiData({ document: documentDto(row ?? { id: documentId, filename: file.name, file_type: file.type, file_size: file.size, domain_slug: domainSlug ?? null, status: 'processing', error_message: null, uploaded_at: new Date() }) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/documents failed', error);
  }
}
