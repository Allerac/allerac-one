import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../../_lib/responses';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';

const credentials = new SpotifyCredentialsService();

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:read', request);
    const status = await credentials.getStatus(user.id);
    return apiData({ status });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/music/status failed', error);
  }
}
