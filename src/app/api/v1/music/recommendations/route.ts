import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { queryRecommendations } from '@/app/services/spotify/spotify-query.service';

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid query', 400, parsed.error.flatten());
    }

    const rows = await queryRecommendations(user.id, parsed.data.limit ?? 30);

    return apiData({
      recommendations: rows.map((r) => ({
        trackId: r.track_id,
        score: r.score,
        reason: r.reason,
        name: r.name,
        artists: r.artists,
        albumName: r.album_name,
        albumImageUrl: r.album_image_url,
        externalUrl: r.external_url,
        previewUrl: r.preview_url,
      })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/music/recommendations failed', error);
  }
}
