import { z } from 'zod';
import { NoteRelatedService } from '@/app/services/knowledge/note-related.service';
import { requireApiDomainUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';

const relatedService = new NoteRelatedService();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const user = await requireApiDomainUser('notes:read', 'notes', request);
    const { id } = await params;
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiError('validation_error', 'Invalid query', 400, parsed.error.flatten());

    const related = await relatedService.getRelated(user.id, id, { limit: parsed.data.limit, isAdmin: user.isAdmin });
    if (!related) return apiError('not_found', 'Note not found', 404);

    return apiData({
      semanticAvailable: related.semanticAvailable,
      notes: related.notes.map(n => ({ id: n.note_id, title: n.title, icon: n.icon, snippet: n.snippet, similarity: Number(n.similarity) })),
      documents: related.documents.map(d => ({ id: d.document_id, filename: d.filename, domainSlug: d.domain_slug, similarity: Number(d.similarity) })),
      memories: related.memories.map(m => ({
        id: m.memory_id, summary: m.summary, keyTopics: m.key_topics, domainSlug: m.domain_slug,
        reason: m.reason, createdAt: iso(m.created_at),
      })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/notes/:id/related failed', error);
  }
}
