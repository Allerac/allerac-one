import { z } from 'zod';
import { PromoteMemoryError, PromoteMemoryService } from '@/app/services/knowledge/promote-memory.service';
import { NoteMoveError } from '@/app/services/notes/note-pages.service';
import { requireApiDomainUser, requireApiUser } from '../../../_lib/auth';
import { noteDto } from '../../../_lib/notes';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';

const promoteService = new PromoteMemoryService();

const bodySchema = z.object({
  parent_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Promotes a memory to a note page. Needs `notes:write` and `memory:read`
 * (API keys), notes domain access, and access to the memory's own domain.
 */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const user = await requireApiDomainUser('notes:write', 'notes', request);
    await requireApiUser('memory:read', request);
    const { id } = await params;

    const raw = await request.text();
    const parsed = bodySchema.safeParse(raw ? JSON.parse(raw) : {});
    if (!parsed.success) return apiError('validation_error', 'Invalid promote payload', 400, parsed.error.flatten());

    const result = await promoteService.promote(
      { id: user.id, is_admin: user.isAdmin },
      id,
      { parentId: parsed.data.parent_id, title: parsed.data.title },
    );
    return apiData(
      { note: noteDto(result.note), alreadyPromoted: result.alreadyPromoted },
      { status: result.alreadyPromoted ? 200 : 201 },
    );
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return apiError('validation_error', 'Invalid JSON body', 400);
    if (error instanceof PromoteMemoryError) return apiError('not_found', error.message, 404);
    if (error instanceof NoteMoveError) return apiError('not_found', error.message, 404);
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/memories/:id/promote failed', error);
  }
}
