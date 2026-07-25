// Music/Spotify tool — reads recommendations and listening data directly
// from PostgreSQL, plus live playlist data from the Spotify Web API. Used by
// the AI in conversations in the Music domain.

import pool from '@/app/clients/db';
import { SpotifyApiService } from '@/app/services/spotify/spotify-api.service';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';

const api = new SpotifyApiService();
const credentials = new SpotifyCredentialsService(api);

export interface MusicUser {
  id: string;
  email: string;
  name: string;
}

export interface RecommendationResult {
  track_id: string;
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
  tracks?: Array<{ track_id: string; rank: number | null; track_name: string; artists: string }>;
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

export interface PlaylistSummaryResult {
  name: string;
  track_count: number;
  spotify_url: string | null;
}

export interface PlaylistsResult {
  playlists?: PlaylistSummaryResult[];
  spotify_connected: boolean;
  error?: string;
}

export interface PlaylistTrackResult {
  track_id: string;
  track_name: string;
  artists: string;
}

export interface PlaylistTracksResult {
  playlist_name?: string;
  tracks?: PlaylistTrackResult[];
  spotify_connected: boolean;
  error?: string;
}

export interface CreatePlaylistResult {
  success: boolean;
  playlist_name?: string;
  spotify_url?: string | null;
  tracks_added?: number;
  tracks_not_found?: string[];
  error?: string;
}

export interface AddTracksResult {
  success: boolean;
  playlist_name?: string;
  tracks_added?: number;
  tracks_not_found?: string[];
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
        `SELECT sr.track_id, sr.score, sr.reason, st.name, st.artists, st.album_name, st.external_url
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
          track_id: r.track_id,
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
        `SELECT lh.track_id, lh.rank, st.name, st.artists
         FROM spotify_listening_history lh
         JOIN spotify_tracks st ON st.id = lh.track_id
         WHERE lh.user_id = $1 AND lh.source = $2
         ORDER BY lh.rank ASC NULLS LAST
         LIMIT 20`,
        [user.id, source],
      );
      return {
        period,
        tracks: res.rows.map((r) => ({ track_id: r.track_id, rank: r.rank, track_name: r.name, artists: formatArtists(r.artists) })),
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

  async getPlaylists(user: MusicUser): Promise<PlaylistsResult> {
    try {
      const accessToken = await credentials.getValidAccessToken(user.id);
      if (!accessToken) return { spotify_connected: false };
      const playlists = await api.getUserPlaylists(accessToken, 50);
      return {
        spotify_connected: true,
        playlists: playlists.map((p) => ({ name: p.name, track_count: p.trackCount, spotify_url: p.externalUrl })),
      };
    } catch (e: any) {
      return { spotify_connected: false, error: e.message };
    }
  }

  async getPlaylistTracks(user: MusicUser, playlistName: string, limit = 50): Promise<PlaylistTracksResult> {
    try {
      const accessToken = await credentials.getValidAccessToken(user.id);
      if (!accessToken) return { spotify_connected: false };
      const playlists = await api.getUserPlaylists(accessToken, 50);
      const needle = playlistName.trim().toLowerCase();
      const match = playlists.find((p) => p.name.toLowerCase() === needle)
        || playlists.find((p) => p.name.toLowerCase().includes(needle));
      if (!match) {
        return { spotify_connected: true, error: `No playlist found matching "${playlistName}"` };
      }
      const items = await api.getPlaylistTracks(accessToken, match.id, Math.min(limit, 100));
      return {
        spotify_connected: true,
        playlist_name: match.name,
        tracks: items.map(({ track }) => ({ track_id: track.id, track_name: track.name, artists: formatArtists(track.artists) })),
      };
    } catch (e: any) {
      return { spotify_connected: false, error: e.message };
    }
  }

  async createPlaylist(user: MusicUser, name: string, tracks?: string[]): Promise<CreatePlaylistResult> {
    try {
      const accessToken = await credentials.getValidAccessToken(user.id);
      if (!accessToken) return { success: false, error: 'Spotify not connected' };

      const playlist = await api.createPlaylist(accessToken, name);
      const { added, notFound } = await this._resolveAndAdd(accessToken, playlist.id, tracks);
      return {
        success: true,
        playlist_name: playlist.name,
        spotify_url: playlist.externalUrl,
        tracks_added: added,
        tracks_not_found: notFound.length > 0 ? notFound : undefined,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async addTracksToPlaylist(user: MusicUser, playlistName: string, tracks: string[]): Promise<AddTracksResult> {
    try {
      const accessToken = await credentials.getValidAccessToken(user.id);
      if (!accessToken) return { success: false, error: 'Spotify not connected' };

      const playlists = await api.getUserPlaylists(accessToken, 50);
      const needle = playlistName.trim().toLowerCase();
      const match = playlists.find((p) => p.name.toLowerCase() === needle)
        || playlists.find((p) => p.name.toLowerCase().includes(needle));
      if (!match) return { success: false, error: `No playlist found matching "${playlistName}"` };

      const { added, notFound } = await this._resolveAndAdd(accessToken, match.id, tracks);
      if (added === 0) {
        return { success: false, playlist_name: match.name, tracks_not_found: notFound, error: 'No matching tracks found on Spotify' };
      }
      return {
        success: true,
        playlist_name: match.name,
        tracks_added: added,
        tracks_not_found: notFound.length > 0 ? notFound : undefined,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // Each entry in `tracks` can be a Spotify track id (already known from a
  // prior get_music_recommendations / get_top_tracks / get_playlist_tracks
  // call) or free-text like "Song Name - Artist", resolved via search.
  private async _resolveAndAdd(
    accessToken: string,
    playlistId: string,
    tracks?: string[],
  ): Promise<{ added: number; notFound: string[] }> {
    if (!tracks || tracks.length === 0) return { added: 0, notFound: [] };

    const ids: string[] = [];
    const notFound: string[] = [];
    for (const t of tracks) {
      if (isSpotifyTrackId(t)) {
        ids.push(t);
        continue;
      }
      const results = await api.searchTrack(accessToken, t, 1);
      if (results[0]) ids.push(results[0].id);
      else notFound.push(t);
    }
    if (ids.length > 0) {
      await api.addTracksToPlaylist(accessToken, playlistId, ids);
    }
    return { added: ids.length, notFound };
  }

  private async _isConnected(userId: string): Promise<boolean> {
    const res = await pool.query('SELECT is_connected FROM spotify_credentials WHERE user_id = $1', [userId]);
    return res.rows[0]?.is_connected === true;
  }
}

function isSpotifyTrackId(value: string): boolean {
  return /^[A-Za-z0-9]{22}$/.test(value);
}
