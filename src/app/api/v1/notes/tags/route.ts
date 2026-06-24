import { NotesService } from '@/app/services/notes/notes.service';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../../_lib/responses';

const notesService = new NotesService();

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('notes:read', request);
    const tags = await notesService.getAllTags(user.id);
    return apiData({ tags });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/notes/tags failed', error);
  }
}
