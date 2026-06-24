import { z } from 'zod';
import { NotesService } from '@/app/services/notes/notes.service';
import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { noteDto, resolveNotesToken } from '../_lib/notes';

const notesService = new NotesService();

const listQuerySchema = z.object({
  tag: z.string().trim().min(1).optional(),
  due_on: z.string().optional(),
  due_before: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createNoteSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  due_date: z.string().nullable().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('notes:read', request);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid note filters', 400, parsed.error.flatten());
    }

    const notes = await notesService.listNotes(user.id, {
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
    const user = await requireApiUser('notes:write', request);
    const parsed = createNoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid note payload', 400, parsed.error.flatten());
    }

    const token = await resolveNotesToken(user.id);
    const note = await notesService.createNote(
      user.id,
      { ...parsed.data, source: parsed.data.source ?? 'api' },
      token,
    );

    return apiData({ note: noteDto(note) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/notes failed', error);
  }
}
