// Music/Spotify tool — reads recommendations and listening data directly
// from PostgreSQL. Used by the AI in conversations in the Music domain.

import pool from '@/app/clients/db';

export interface MusicUser {
  id: string;
  email: string;
  name: string;
}

export interface RecommendationResult {
  track_name: string;
  artists: string;
  album: string | null;
  score: number;
  reason: string | null;
  spotify_url: string | null;
}

export interface RecommendationsResult {
  recommendations?: RecommendationResult[];
  spotify_connected: boolean;
  error?: string;
}

export interface TopTracksResult {
  period: string;
  tracks?: Array<{ rank: number | null; track_name: string; artists: string }>;
  error?: string;
}

export interface ListeningStatsResult {
  period: string;
  total_plays?: number;
  unique_tracks?: number;
  top_genres?: string[];
  spotify_connected: boolean;
  error?: string;
}

export interface SpotifyStatusResult {
  is_connected: boolean;
  last_sync_at?: string | null;
  error?: string;
}

function formatArtists(artists: Array<{ name: string }>): string {
  return (artists || []).map((a) => a.name).join(', ');
}

export class MusicTool {

  get isConfigured(): boolean {
    return true; // Always available — reads from local PostgreSQL
  }

  async getRecommendations(user: MusicUser, limit: number = 10): Promise<RecommendationsResult> {
    try {
      const connected = await this._isConnected(user.id);
      if (!connected) return { spotify_connected: false };

      const res = await pool.query(
        `SELECT sr.score, sr.reason, st.name, st.artists, st.album_name, st.external_url
         FROM spotify_recommendations sr
         JOIN spotify_tracks st ON st.id = sr.track_id
         WHERE sr.user_id = $1
         ORDER BY sr.score DESC
         LIMIT $2`,
        [user.id, Math.min(limit, 50)],
      );
      return {
        spotify_connected: true,
        recommendations: res.rows.map((r) => ({
          track_name: r.name,
          artists: formatArtists(r.artists),
          album: r.album_name,
          score: Number(r.score),
          reason: r.reason,
          spotify_url: r.external_url,
        })),
      };
    } catch (e: any) {
      return { spotify_connected: false, error: e.message };
    }
  }

  async getTopTracks(user: MusicUser, period: string = 'medium'): Promise<TopTracksResult> {
    const source = period === 'short' ? 'top_short' : period === 'long' ? 'top_long' : 'top_medium';
    try {
      const res = await pool.query(
        `SELECT lh.rank, st.name, st.artists
         FROM spotify_listening_history lh
         JOIN spotify_tracks st ON st.id = lh.track_id
         WHERE lh.user_id = $1 AND lh.source = $2
         ORDER BY lh.rank ASC NULLS LAST
         LIMIT 20`,
        [user.id, source],
      );
      return {
        period,
        tracks: res.rows.map((r) => ({ rank: r.rank, track_name: r.name, artists: formatArtists(r.artists) })),
      };
    } catch (e: any) {
      return { period, error: e.message };
    }
  }

  async getListeningStats(user: MusicUser, period: string = 'month'): Promise<ListeningStatsResult> {
    const days = period === 'week' ? 7 : period === 'year' ? 365 : 30;
    try {
      const connected = await this._isConnected(user.id);
      if (!connected) return { period, spotify_connected: false };

      const res = await pool.query(
        `SELECT COUNT(*) AS total_plays, COUNT(DISTINCT lh.track_id) AS unique_tracks
         FROM spotify_listening_history lh
         WHERE lh.user_id = $1 AND lh.source = 'recently_played'
           AND lh.played_at >= NOW() - ($2 || ' days')::interval`,
        [user.id, days],
      );
      const genresRes = await pool.query(
        `SELECT genre, COUNT(*) AS cnt
         FROM spotify_listening_history lh
         JOIN spotify_tracks st ON st.id = lh.track_id
         CROSS JOIN LATERAL unnest(st.genres) AS genre
         WHERE lh.user_id = $1
         GROUP BY genre
         ORDER BY cnt DESC
         LIMIT 5`,
        [user.id],
      );
      const row = res.rows[0];
      return {
        period,
        spotify_connected: true,
        total_plays: Number(row.total_plays),
        unique_tracks: Number(row.unique_tracks),
        top_genres: genresRes.rows.map((r) => r.genre),
      };
    } catch (e: any) {
      return { period, spotify_connected: false, error: e.message };
    }
  }

  async getSpotifyStatus(user: MusicUser): Promise<SpotifyStatusResult> {
    try {
      const res = await pool.query(
        'SELECT is_connected, last_sync_at FROM spotify_credentials WHERE user_id = $1',
        [user.id],
      );
      if (res.rows.length === 0) return { is_connected: false };
      return { is_connected: res.rows[0].is_connected, last_sync_at: res.rows[0].last_sync_at };
    } catch (e: any) {
      return { is_connected: false, error: e.message };
    }
  }

  private async _isConnected(userId: string): Promise<boolean> {
    const res = await pool.query('SELECT is_connected FROM spotify_credentials WHERE user_id = $1', [userId]);
    return res.rows[0]?.is_connected === true;
  }
}
