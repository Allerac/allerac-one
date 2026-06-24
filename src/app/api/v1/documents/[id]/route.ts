import { DocumentService } from '@/app/services/rag/document.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { resolveEmbeddingToken } from '../../_lib/documents';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('documents:write', request);
    const { id } = await params;

    const token = await resolveEmbeddingToken(user.id);
    const docService = new DocumentService(new EmbeddingService(token));

    try {
      await docService.deleteDocument(id, user.id);
    } catch (e: any) {
      if (e.message?.includes('not found') || e.message?.includes('permission')) {
        return apiError('not_found', 'Document not found', 404);
      }
      throw e;
    }

    return apiData({ deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/documents/:id failed', error);
  }
}
