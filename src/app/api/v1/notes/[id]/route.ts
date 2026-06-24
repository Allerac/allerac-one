import { z } from 'zod';
import { NotesService } from '@/app/services/notes/notes.service';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { noteDto } from '../../_lib/notes';

const notesService = new NotesService();

const updateNoteSchema = z.object({
  content: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  due_date: z.string().nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('notes:write', request);
    const { id } = await params;
    const parsed = updateNoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid note update payload', 400, parsed.error.flatten());
    }

    const note = await notesService.updateNote(user.id, id, parsed.data);
    if (!note) return apiError('not_found', 'Note not found', 404);

    return apiData({ note: noteDto(note) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('PATCH /api/v1/notes/:id failed', error);
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('notes:write', request);
    const { id } = await params;

    const deleted = await notesService.deleteNote(user.id, id);
    if (!deleted) return apiError('not_found', 'Note not found', 404);

    return apiData({ deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/notes/:id failed', error);
  }
}
