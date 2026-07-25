import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { queryRecentlyPlayed } from '@/app/services/spotify/spotify-query.service';

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid query', 400, parsed.error.flatten());
    }

    const rows = await queryRecentlyPlayed(user.id, parsed.data.limit ?? 20);

    return apiData({
      tracks: rows.map((r) => ({
        trackId: r.track_id,
        name: r.name,
        artists: r.artists,
        albumImageUrl: r.album_image_url,
        externalUrl: r.external_url,
        playedAt: r.played_at,
      })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/music/recently-played failed', error);
  }
}
