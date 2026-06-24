import { z } from 'zod';
import { NotesService } from '@/app/services/notes/notes.service';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { noteFromKeyword, noteSearchResultDto, resolveNotesToken } from '../../_lib/notes';

const notesService = new NotesService();

const querySchema = z.object({
  q: z.string().trim().min(1),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('notes:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'q is required', 400, parsed.error.flatten());
    }

    const token = await resolveNotesToken(user.id);
    if (token) {
      const results = await notesService.searchNotes(user.id, parsed.data.q, token);
      return apiData({ results: results.map(noteSearchResultDto) });
    }

    const notes = await notesService.keywordSearchNotes(user.id, parsed.data.q);
    return apiData({ results: notes.map(noteFromKeyword) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/notes/search failed', error);
  }
}
