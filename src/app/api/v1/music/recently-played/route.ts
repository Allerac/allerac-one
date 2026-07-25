import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

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
    const limit = Math.min(parsed.data.limit ?? 20, 50);

    const res = await pool.query(
      `SELECT lh.track_id, st.name, st.artists, st.album_image_url, st.external_url, lh.played_at
       FROM spotify_listening_history lh
       JOIN spotify_tracks st ON st.id = lh.track_id
       WHERE lh.user_id = $1 AND lh.source = 'recently_played'
       ORDER BY lh.played_at DESC NULLS LAST
       LIMIT $2`,
      [user.id, limit],
    );

    return apiData({
      tracks: res.rows.map((r) => ({
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
