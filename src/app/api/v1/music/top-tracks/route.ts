import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

const SOURCE_BY_PERIOD = {
  top_short: 'top_short',
  top_medium: 'top_medium',
  top_long: 'top_long',
} as const;

const querySchema = z.object({
  period: z.enum(['top_short', 'top_medium', 'top_long']).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('music:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid query', 400, parsed.error.flatten());
    }
    const period = SOURCE_BY_PERIOD[parsed.data.period ?? 'top_medium'];
    const limit = Math.min(parsed.data.limit ?? 20, 50);

    const res = await pool.query(
      `SELECT lh.track_id, st.name, st.artists, st.album_image_url, st.external_url, lh.rank
       FROM spotify_listening_history lh
       JOIN spotify_tracks st ON st.id = lh.track_id
       WHERE lh.user_id = $1 AND lh.source = $2
       ORDER BY lh.rank ASC NULLS LAST
       LIMIT $3`,
      [user.id, period, limit],
    );

    return apiData({
      period,
      tracks: res.rows.map((r) => ({
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
