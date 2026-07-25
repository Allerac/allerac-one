import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { queryTopTracks } from '@/app/services/spotify/spotify-query.service';

const querySchema = z.object({
  period: z.enum(['top_short', 'top_medium', 'top_long']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid query', 400, parsed.error.flatten());
    }
    const period = parsed.data.period ?? 'top_medium';

    const rows = await queryTopTracks(user.id, period, parsed.data.limit ?? 20);

    return apiData({
      period,
      tracks: rows.map((r) => ({
        trackId: r.track_id,
        name: r.name,
        artists: r.artists,
        albumImageUrl: r.album_image_url,
        externalUrl: r.external_url,
        rank: r.rank,
      })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/music/top-tracks failed', error);
  }
}
