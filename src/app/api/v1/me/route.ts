import { apiAuthError, apiData, apiInternalError } from '../_lib/responses';
import { requireApiUser } from '../_lib/auth';

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser('profile:read');
    return apiData({ user });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/me failed', error);
  }
}

