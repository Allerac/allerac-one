'use server';

import { requireCurrentUser } from '@/app/lib/auth-session';
import { SpotifyApiService } from '@/app/services/spotify/spotify-api.service';
import { SpotifyCredentialsService } from '@/app/services/spotify/spotify-credentials.service';
import { queryRecentlyPlayed, queryRecommendations, queryTopTracks } from '@/app/services/spotify/spotify-query.service';
import { runSpotifySync } from '@/app/services/spotify/spotify-sync.service';

export type { SpotifyStatus } from '@/app/services/spotify/spotify-credentials.service';

const api = new SpotifyApiService();
const credentials = new SpotifyCredentialsService(api);

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

export interface SpotifyPlaylistOption {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  externalUrl: string | null;
}

export async function getSpotifyPlaylists(): Promise<SpotifyPlaylistOption[]> {
  const userId = await getSessionUserId();
  const accessToken = await credentials.getValidAccessToken(userId);
  if (!accessToken) throw new Error('Spotify not connected');
  return api.getUserPlaylists(accessToken, 50);
}

export interface PlaylistTrackRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_image_url: string | null;
  external_url: string | null;
}

export async function getSpotifyPlaylistTracks(playlistId: string, limit = 100): Promise<PlaylistTrackRow[]> {
  const userId = await getSessionUserId();
  const accessToken = await credentials.getValidAccessToken(userId);
  if (!accessToken) throw new Error('Spotify not connected');
  const items = await api.getPlaylistTracks(accessToken, playlistId, limit);
  return items.map(({ track }) => ({
    track_id: track.id,
    name: track.name,
    artists: track.artists,
    album_image_url: track.albumImageUrl,
    external_url: track.externalUrl,
  }));
}

export interface CreatedPlaylistResult {
  id: string;
  name: string;
  externalUrl: string | null;
}

export async function createSpotifyPlaylist(name: string, trackId?: string): Promise<CreatedPlaylistResult> {
  const userId = await getSessionUserId();
  const accessToken = await credentials.getValidAccessToken(userId);
  if (!accessToken) throw new Error('Spotify not connected');

  const playlist = await api.createPlaylist(accessToken, name);
  if (trackId) {
    await api.addTracksToPlaylist(accessToken, playlist.id, [trackId]);
  }
  return playlist;
}

export async function addTrackToSpotifyPlaylist(playlistId: string, trackId: string): Promise<{ success: true }> {
  const userId = await getSessionUserId();
  const accessToken = await credentials.getValidAccessToken(userId);
  if (!accessToken) throw new Error('Spotify not connected');
  await api.addTracksToPlaylist(accessToken, playlistId, [trackId]);
  return { success: true };
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
  return queryRecommendations(userId, limit);
}

export interface TopTrackRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_image_url: string | null;
  external_url: string | null;
  rank: number | null;
}

export async function getTopTracks(period: 'top_short' | 'top_medium' | 'top_long' = 'top_medium', limit = 20): Promise<TopTrackRow[]> {
  const userId = await getSessionUserId();
  return queryTopTracks(userId, period, limit);
}

export interface RecentlyPlayedRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album_image_url: string | null;
  external_url: string | null;
  played_at: string | null;
}

export async function getRecentlyPlayed(limit = 20): Promise<RecentlyPlayedRow[]> {
  const userId = await getSessionUserId();
  return queryRecentlyPlayed(userId, limit);
}
