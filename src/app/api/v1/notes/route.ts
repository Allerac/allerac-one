import { z } from 'zod';
import { NotesService } from '@/app/services/notes/notes.service';
import { requireApiDomainUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { noteDto } from '../_lib/notes';
import { NoteMoveError, NotePagesService } from '@/app/services/notes/note-pages.service';

const notesService = new NotesService();
const pagesService = new NotePagesService();

const listQuerySchema = z.object({
  tag: z.string().trim().min(1).optional(),
  due_on: z.string().optional(),
  due_before: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // 'root' lists top-level pages; a UUID lists that page's direct children.
  parent_id: z.union([z.literal('root'), z.string().uuid()]).optional(),
  include_archived: z.enum(['true', 'false']).optional(),
});

const createNoteSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  due_date: z.string().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiDomainUser('notes:read', 'notes', request);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid note filters', 400, parsed.error.flatten());
    }

    const includeArchived = parsed.data.include_archived === 'true';
    if (parsed.data.parent_id) {
      const parentId = parsed.data.parent_id === 'root' ? null : parsed.data.parent_id;
      if (parentId && !(await notesService.getNote(user.id, parentId))) {
        return apiError('not_found', 'Parent note not found', 404);
      }
      const children = await pagesService.listChildren(user.id, parentId, {
        includeArchived,
        limit: parsed.data.limit ?? 50,
      });
      return apiData({ notes: children.map(noteDto) });
    }

    const notes = await notesService.listNotes(user.id, {
      includeArchived,
      tag: parsed.data.tag,
      due_on: parsed.data.due_on,
      due_before: parsed.data.due_before,
      overdue: parsed.data.overdue,
      limit: parsed.data.limit ?? 50,
    });

    return apiData({ notes: notes.map(noteDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/notes failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiDomainUser('notes:write', 'notes', request);
    const parsed = createNoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid note payload', 400, parsed.error.flatten());
    }

    const note = await notesService.createNote(
      user.id,
      { ...parsed.data, source: parsed.data.source ?? 'api' },
    );

    return apiData({ note: noteDto(note) }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof NoteMoveError) return apiError('not_found', error.message, 404);
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/notes failed', error);
  }
}
