// Read-only queries against synced Spotify data (recommendations, top
// tracks, recently played). Shared by the music Server Actions
// (src/app/actions/music.ts, used by the web UI) and the Control API v1
// routes (src/app/api/v1/music/*, used by external API-key clients) so the
// SQL isn't duplicated between the two call paths — Server Actions can't be
// invoked with a Bearer token, so the API routes can't call them directly.

import pool from '@/app/clients/db';

export interface RecommendationQueryRow {
  track_id: string;
  score: number;
  reason: string | null;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_name: string | null;
  album_image_url: string | null;
  external_url: string | null;
  preview_url: string | null;
}

export async function queryRecommendations(userId: string, limit: number): Promise<RecommendationQueryRow[]> {
  const res = await pool.query(
    `SELECT sr.track_id, sr.score, sr.reason,
            st.name, st.artists, st.album_name, st.album_image_url, st.external_url, st.preview_url
     FROM spotify_recommendations sr
     JOIN spotify_tracks st ON st.id = sr.track_id
     WHERE sr.user_id = $1
     ORDER BY sr.score DESC
     LIMIT $2`,
    [userId, Math.min(limit, 100)],
  );
  return res.rows;
}

export type TopTracksPeriod = 'top_short' | 'top_medium' | 'top_long';

export interface TopTrackQueryRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_image_url: string | null;
  external_url: string | null;
  rank: number | null;
}

export async function queryTopTracks(
  userId: string,
  period: TopTracksPeriod,
  limit: number,
): Promise<TopTrackQueryRow[]> {
  const res = await pool.query(
    `SELECT lh.track_id, st.name, st.artists, st.album_image_url, st.external_url, lh.rank
     FROM spotify_listening_history lh
     JOIN spotify_tracks st ON st.id = lh.track_id
     WHERE lh.user_id = $1 AND lh.source = $2
     ORDER BY lh.rank ASC NULLS LAST
     LIMIT $3`,
    [userId, period, Math.min(limit, 100)],
  );
  return res.rows;
}

export interface RecentlyPlayedQueryRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_image_url: string | null;
  external_url: string | null;
  played_at: string | null;
}

export async function queryRecentlyPlayed(userId: string, limit: number): Promise<RecentlyPlayedQueryRow[]> {
  const res = await pool.query(
    `SELECT lh.track_id, st.name, st.artists, st.album_image_url, st.external_url, lh.played_at
     FROM spotify_listening_history lh
     JOIN spotify_tracks st ON st.id = lh.track_id
     WHERE lh.user_id = $1 AND lh.source = 'recently_played'
     ORDER BY lh.played_at DESC NULLS LAST
     LIMIT $2`,
    [userId, Math.min(limit, 50)],
  );
  return res.rows;
}
