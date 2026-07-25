import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';
import { runSpotifySync } from '@/app/services/spotify/spotify-sync.service';

const credentials = new SpotifyCredentialsService();

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:write', request);
    const accessToken = await credentials.getValidAccessToken(user.id);
    if (!accessToken) return apiError('spotify_not_connected', 'Spotify is not connected', 422);

    const result = await runSpotifySync(user.id);
    return apiData({ result });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/music/sync failed', error);
  }
}
