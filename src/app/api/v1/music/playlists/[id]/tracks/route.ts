import { z } from 'zod';
import { requireApiUser } from '../../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../../_lib/responses';
import { SpotifyApiService } from '@/app/services/spotify/spotify-api.service';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';

const api = new SpotifyApiService();
const credentials = new SpotifyCredentialsService(api);

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireApiUser('music:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid query', 400, parsed.error.flatten());
    }

    const accessToken = await credentials.getValidAccessToken(user.id);
    if (!accessToken) return apiError('spotify_not_connected', 'Spotify is not connected', 422);

    const { id } = await params;
    const items = await api.getPlaylistTracks(accessToken, id, Math.min(parsed.data.limit ?? 100, 200));
    return apiData({
      tracks: items.map(({ track, addedAt }) => ({
        trackId: track.id,
        name: track.name,
        artists: track.artists,
        albumImageUrl: track.albumImageUrl,
        externalUrl: track.externalUrl,
        addedAt,
      })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/music/playlists/[id]/tracks failed', error);
  }
}

const addTracksSchema = z.object({
  trackIds: z.array(z.string()).min(1).max(100),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireApiUser('music:write', request);
    const parsed = addTracksSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'trackIds is required', 400, parsed.error.flatten());
    }

    const accessToken = await credentials.getValidAccessToken(user.id);
    if (!accessToken) return apiError('spotify_not_connected', 'Spotify is not connected', 422);

    const { id } = await params;
    await api.addTracksToPlaylist(accessToken, id, parsed.data.trackIds);
    return apiData({ added: parsed.data.trackIds.length }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/music/playlists/[id]/tracks failed', error);
  }
}
