import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { SpotifyApiService } from '@/app/services/spotify/spotify-api.service';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';

const api = new SpotifyApiService();
const credentials = new SpotifyCredentialsService(api);

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:read', request);
    const accessToken = await credentials.getValidAccessToken(user.id);
    if (!accessToken) return apiError('spotify_not_connected', 'Spotify is not connected', 422);

    const playlists = await api.getUserPlaylists(accessToken, 50);
    return apiData({
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        trackCount: p.trackCount,
        externalUrl: p.externalUrl,
      })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/music/playlists failed', error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trackIds: z.array(z.string()).max(100).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:write', request);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'name is required', 400, parsed.error.flatten());
    }

    const accessToken = await credentials.getValidAccessToken(user.id);
    if (!accessToken) return apiError('spotify_not_connected', 'Spotify is not connected', 422);

    const playlist = await api.createPlaylist(accessToken, parsed.data.name);
    if (parsed.data.trackIds && parsed.data.trackIds.length > 0) {
      await api.addTracksToPlaylist(accessToken, playlist.id, parsed.data.trackIds);
    }

    return apiData(
      { playlist: { id: playlist.id, name: playlist.name, externalUrl: playlist.externalUrl } },
      { status: 201 },
    );
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/music/playlists failed', error);
  }
}
