import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

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
    const limit = Math.min(parsed.data.limit ?? 30, 100);

    const res = await pool.query(
      `SELECT sr.track_id, sr.score, sr.reason,
              st.name, st.artists, st.album_name, st.album_image_url, st.external_url, st.preview_url
       FROM spotify_recommendations sr
       JOIN spotify_tracks st ON st.id = sr.track_id
       WHERE sr.user_id = $1
       ORDER BY sr.score DESC
       LIMIT $2`,
      [user.id, limit],
    );

    return apiData({
      recommendations: res.rows.map((r) => ({
        trackId: r.track_id,
        score: Number(r.score),
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
