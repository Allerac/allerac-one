'use server';

import pool from '@/app/clients/db';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';
import { runSpotifySync } from '@/app/services/spotify/spotify-sync.service';

export type { SpotifyStatus } from '@/app/services/spotify/spotify-credentials.service';

const credentials = new SpotifyCredentialsService();

async function getSessionUserId(): Promise<string> {
  const user = await requireCurrentUser();
  return user.id;
}

export async function getSpotifyStatus() {
  const userId = await getSessionUserId();
  return credentials.getStatus(userId);
}

export async function disconnectSpotify() {
  const userId = await getSessionUserId();
  await credentials.disconnect(userId);
  return { success: true };
}

export async function triggerSpotifySync() {
  const userId = await getSessionUserId();
  const result = await runSpotifySync(userId);
  return { success: true, ...result };
}

export interface RecommendationRow {
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

export async function getRecommendations(limit = 30): Promise<RecommendationRow[]> {
  const userId = await getSessionUserId();
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

export interface TopTrackRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_image_url: string | null;
  rank: number | null;
}

export async function getTopTracks(period: 'top_short' | 'top_medium' | 'top_long' = 'top_medium', limit = 20): Promise<TopTrackRow[]> {
  const userId = await getSessionUserId();
  const res = await pool.query(
    `SELECT lh.track_id, st.name, st.artists, st.album_image_url, lh.rank
     FROM spotify_listening_history lh
     JOIN spotify_tracks st ON st.id = lh.track_id
     WHERE lh.user_id = $1 AND lh.source = $2
     ORDER BY lh.rank ASC NULLS LAST
     LIMIT $3`,
    [userId, period, Math.min(limit, 50)],
  );
  return res.rows;
}

export interface RecentlyPlayedRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_image_url: string | null;
  played_at: string | null;
}

export async function getRecentlyPlayed(limit = 20): Promise<RecentlyPlayedRow[]> {
  const userId = await getSessionUserId();
  const res = await pool.query(
    `SELECT lh.track_id, st.name, st.artists, st.album_image_url, lh.played_at
     FROM spotify_listening_history lh
     JOIN spotify_tracks st ON st.id = lh.track_id
     WHERE lh.user_id = $1 AND lh.source = 'recently_played'
     ORDER BY lh.played_at DESC NULLS LAST
     LIMIT $2`,
    [userId, Math.min(limit, 50)],
  );
  return res.rows;
}
