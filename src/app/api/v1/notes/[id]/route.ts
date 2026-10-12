import { z } from 'zod';
import { NotesService } from '@/app/services/notes/notes.service';
import { requireApiDomainUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { noteDto, noteSummaryDto } from '../../_lib/notes';
import { NoteMoveError, NotePagesService } from '@/app/services/notes/note-pages.service';

const notesService = new NotesService();
const pagesService = new NotePagesService();

const updateNoteSchema = z.object({
  content: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  due_date: z.string().nullable().optional(),
  // Moves the note; null moves it to the top level.
  parent_id: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
  archived: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiDomainUser('notes:read', 'notes', request);
    const { id } = await params;
    const note = await notesService.getNote(user.id, id);
    if (!note) return apiError('not_found', 'Note not found', 404);
    const [breadcrumbs, children] = await Promise.all([
      pagesService.getBreadcrumbs(user.id, id),
      pagesService.listChildren(user.id, id, { limit: 200 }),
    ]);
    return apiData({
      note: noteDto(note),
      path: breadcrumbs.map(b => ({ id: b.id, title: b.title, icon: b.icon })),
      children: children.map(noteSummaryDto),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/notes/:id failed', error);
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiDomainUser('notes:write', 'notes', request);
    const { id } = await params;
    const parsed = updateNoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid note update payload', 400, parsed.error.flatten());
    }

    const { parent_id, position, archived, ...fields } = parsed.data;
    const hasFields = Object.values(fields).some(v => v !== undefined);
    if (!hasFields && parent_id === undefined && position === undefined && archived === undefined) {
      return apiError('validation_error', 'Nothing to update', 400);
    }

    let note = hasFields ? await notesService.updateNote(user.id, id, fields) : await notesService.getNote(user.id, id);
    if (!note) return apiError('not_found', 'Note not found', 404);

    if (parent_id !== undefined || position !== undefined) {
      const targetParent = parent_id !== undefined ? parent_id : (note.parent_id ?? null);
      note = await pagesService.moveNote(user.id, id, targetParent, position);
    }
    if (archived !== undefined) {
      await pagesService.setArchived(user.id, id, archived);
      note = (await notesService.getNote(user.id, id)) ?? note;
    }

    return apiData({ note: noteDto(note) });
  } catch (error: unknown) {
    if (error instanceof NoteMoveError) {
      return error.code === 'cycle'
        ? apiError('conflict', error.message, 409)
        : apiError('not_found', error.message, 404);
    }
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
    const user = await requireApiDomainUser('notes:write', 'notes', request);
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
