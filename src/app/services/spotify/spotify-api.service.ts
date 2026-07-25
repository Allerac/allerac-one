const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const SCOPES = [
  'user-read-email',
  'user-read-private',
  'user-read-recently-played',
  'user-top-read',
  'user-follow-read',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
}

export interface SpotifyProfile {
  spotifyUserId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  albumName: string | null;
  albumImageUrl: string | null;
  popularity: number;
  previewUrl: string | null;
  externalUrl: string | null;
}

export interface RecentlyPlayedItem {
  track: SpotifyTrack;
  playedAt: string;
}

export interface SavedTrackItem {
  track: SpotifyTrack;
  addedAt: string;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  externalUrl: string | null;
}

export interface CreatedPlaylist {
  id: string;
  name: string;
  externalUrl: string | null;
}

export interface PlaylistTrackItem {
  track: SpotifyTrack;
  addedAt: string;
}

export type TopTimeRange = 'short_term' | 'medium_term' | 'long_term';

function getConfig() {
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI?.trim() ?? '',
  };
}

function assertConfigured() {
  const config = getConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('Spotify is not configured');
  }
  return config;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function parseResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Spotify ${operation} failed (http_${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

function mapTrack(raw: any): SpotifyTrack {
  return {
    id: raw.id,
    name: raw.name,
    artists: (raw.artists || []).map((a: any) => ({ id: a.id, name: a.name })),
    albumName: raw.album?.name ?? null,
    albumImageUrl: raw.album?.images?.[0]?.url ?? null,
    popularity: raw.popularity ?? 0,
    previewUrl: raw.preview_url ?? null,
    externalUrl: raw.external_urls?.spotify ?? null,
  };
}

export class SpotifyApiService {
  isConfigured(): boolean {
    const config = getConfig();
    return Boolean(config.clientId && config.clientSecret && config.redirectUri);
  }

  buildAuthUrl(state: string): string {
    const config = assertConfigured();
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: SCOPES,
      state,
    });
    return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<SpotifyTokenResponse> {
    const config = assertConfigured();
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(config.clientId, config.clientSecret),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
      }),
    });
    const token = await parseResponse<SpotifyTokenResponse>(response, 'token exchange');
    if (!token.access_token || !token.refresh_token) {
      throw new Error('Spotify token exchange returned incomplete credentials');
    }
    return token;
  }

  async refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
    const config = assertConfigured();
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(config.clientId, config.clientSecret),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const token = await parseResponse<SpotifyTokenResponse>(response, 'token refresh');
    if (!token.access_token) {
      throw new Error('Spotify token refresh returned incomplete credentials');
    }
    // Spotify does not always return a new refresh_token — keep the old one if omitted.
    return { ...token, refresh_token: token.refresh_token || refreshToken };
  }

  async getProfile(accessToken: string): Promise<SpotifyProfile> {
    const response = await fetch(`${SPOTIFY_API_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await parseResponse<{ id: string; display_name?: string; images?: Array<{ url: string }> }>(
      response,
      'profile request',
    );
    return {
      spotifyUserId: body.id,
      displayName: body.display_name?.trim() || 'Spotify user',
      avatarUrl: body.images?.[0]?.url || null,
    };
  }

  async getRecentlyPlayed(accessToken: string, limit = 50): Promise<RecentlyPlayedItem[]> {
    const response = await fetch(
      `${SPOTIFY_API_URL}/me/player/recently-played?limit=${Math.min(limit, 50)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{ items: Array<{ track: any; played_at: string }> }>(
      response,
      'recently played request',
    );
    return (body.items || []).map((item) => ({
      track: mapTrack(item.track),
      playedAt: item.played_at,
    }));
  }

  async getTopTracks(accessToken: string, timeRange: TopTimeRange, limit = 50): Promise<SpotifyTrack[]> {
    const response = await fetch(
      `${SPOTIFY_API_URL}/me/top/tracks?time_range=${timeRange}&limit=${Math.min(limit, 50)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{ items: any[] }>(response, 'top tracks request');
    return (body.items || []).map(mapTrack);
  }

  async getTopArtists(accessToken: string, timeRange: TopTimeRange, limit = 20): Promise<SpotifyArtist[]> {
    const response = await fetch(
      `${SPOTIFY_API_URL}/me/top/artists?time_range=${timeRange}&limit=${Math.min(limit, 50)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{ items: any[] }>(response, 'top artists request');
    return (body.items || []).map((a) => ({
      id: a.id,
      name: a.name,
      genres: a.genres || [],
      popularity: a.popularity ?? 0,
    }));
  }

  async getSavedTracks(accessToken: string, maxItems = 200): Promise<SavedTrackItem[]> {
    const results: SavedTrackItem[] = [];
    let offset = 0;
    const pageSize = 50;
    while (results.length < maxItems) {
      const response = await fetch(
        `${SPOTIFY_API_URL}/me/tracks?limit=${pageSize}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const body = await parseResponse<{ items: Array<{ track: any; added_at: string }>; next: string | null }>(
        response,
        'saved tracks request',
      );
      const items = body.items || [];
      for (const item of items) {
        if (!item.track?.id) continue;
        results.push({ track: mapTrack(item.track), addedAt: item.added_at });
      }
      if (!body.next || items.length === 0) break;
      offset += pageSize;
    }
    return results.slice(0, maxItems);
  }

  async getUserPlaylists(accessToken: string, limit = 20): Promise<PlaylistSummary[]> {
    const response = await fetch(
      `${SPOTIFY_API_URL}/me/playlists?limit=${Math.min(limit, 50)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{
      items: Array<{
        id: string;
        name: string;
        images?: Array<{ url: string }>;
        // Spotify's Feb 2026 migration renamed the playlist's item-count field
        // from "tracks" to "items" — read the new one, fall back to the old.
        items?: { total: number };
        tracks?: { total: number };
        external_urls?: { spotify?: string };
      }>;
    }>(response, 'playlists request');
    return (body.items || []).filter((p) => p?.id).map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.images?.[0]?.url ?? null,
      trackCount: p.items?.total ?? p.tracks?.total ?? 0,
      externalUrl: p.external_urls?.spotify ?? null,
    }));
  }

  async searchTrack(accessToken: string, query: string, limit = 5): Promise<SpotifyTrack[]> {
    const response = await fetch(
      `${SPOTIFY_API_URL}/search?q=${encodeURIComponent(query)}&type=track&limit=${Math.min(limit, 50)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{ tracks?: { items: any[] } }>(response, 'search request');
    return (body.tracks?.items || []).map(mapTrack);
  }

  async createPlaylist(accessToken: string, name: string, description = ''): Promise<CreatedPlaylist> {
    // Spotify retired POST /users/{user_id}/playlists in its Feb 2026 Web API
    // migration (403 for every caller past the Mar 9 2026 deadline) — /me/playlists
    // is the replacement and no longer needs the caller's Spotify user id.
    const response = await fetch(`${SPOTIFY_API_URL}/me/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description, public: false }),
    });
    const body = await parseResponse<{ id: string; name: string; external_urls?: { spotify?: string } }>(
      response,
      'create playlist request',
    );
    return { id: body.id, name: body.name, externalUrl: body.external_urls?.spotify ?? null };
  }

  async addTracksToPlaylist(accessToken: string, playlistId: string, trackIds: string[]): Promise<void> {
    // Spotify retired POST /playlists/{id}/tracks in its Feb 2026 Web API
    // migration — /items is the replacement (request body shape is unchanged).
    for (let i = 0; i < trackIds.length; i += 100) {
      const batch = trackIds.slice(i, i + 100);
      const response = await fetch(`${SPOTIFY_API_URL}/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: batch.map((id) => `spotify:track:${id}`) }),
      });
      await parseResponse(response, 'add tracks to playlist request');
    }
  }

  async getPlaylistTracks(accessToken: string, playlistId: string, maxItems = 50): Promise<PlaylistTrackItem[]> {
    const results: PlaylistTrackItem[] = [];
    let offset = 0;
    const pageSize = 50;
    while (results.length < maxItems) {
      // GET /playlists/{id}/tracks was retired in the same migration — /items is
      // the replacement, and the per-entry "track" field is now "item".
      const response = await fetch(
        `${SPOTIFY_API_URL}/playlists/${playlistId}/items?limit=${pageSize}&offset=${offset}&fields=items(added_at,item(id,name,artists,album,popularity,preview_url,external_urls)),next`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const body = await parseResponse<{ items: Array<{ item: any; added_at: string }>; next: string | null }>(
        response,
        'playlist tracks request',
      );
      const items = body.items || [];
      for (const item of items) {
        if (!item.item?.id) continue; // local files / unavailable tracks have no id
        results.push({ track: mapTrack(item.item), addedAt: item.added_at || new Date().toISOString() });
      }
      if (!body.next || items.length === 0) break;
      offset += pageSize;
    }
    return results.slice(0, maxItems);
  }

  async getArtists(accessToken: string, artistIds: string[]): Promise<SpotifyArtist[]> {
    if (artistIds.length === 0) return [];
    const results: SpotifyArtist[] = [];
    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      const response = await fetch(`${SPOTIFY_API_URL}/artists?ids=${batch.join(',')}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await parseResponse<{ artists: any[] }>(response, 'artists request');
      for (const a of body.artists || []) {
        if (!a) continue;
        results.push({ id: a.id, name: a.name, genres: a.genres || [], popularity: a.popularity ?? 0 });
      }
    }
    return results;
  }

  async getArtistAlbums(accessToken: string, artistId: string, limit = 10): Promise<Array<{ id: string; name: string }>> {
    const response = await fetch(
      `${SPOTIFY_API_URL}/artists/${artistId}/albums?include_groups=album,single&limit=${Math.min(limit, 50)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{ items: Array<{ id: string; name: string }> }>(response, 'artist albums request');
    return body.items || [];
  }

  async getAlbumTracks(accessToken: string, albumId: string, limit = 20): Promise<SpotifyTrack[]> {
    const response = await fetch(
      `${SPOTIFY_API_URL}/albums/${albumId}/tracks?limit=${Math.min(limit, 50)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{ items: any[] }>(response, 'album tracks request');
    // Album track objects don't include album info — the caller already knows the album.
    return (body.items || []).map((t) => mapTrack({ ...t, album: undefined }));
  }
}
