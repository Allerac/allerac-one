// Orchestrates a full Spotify sync: pulls recently-played + top tracks/artists,
// upserts the local track catalog, records listening history, generates text
// embeddings for any track missing one, discovers candidate tracks from known
// artists' catalogs, and finally recomputes recommendations.

import pool from '@/app/clients/db';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import {
  SpotifyApiService,
  SpotifyArtist,
  SpotifyTrack,
  TopTimeRange,
} from './spotify-api.service';
import { SpotifyCredentialsService } from './spotify-credentials.service';
import { generateRecommendations } from './spotify-recommendation.service';

const TOP_WINDOWS: Array<{ range: TopTimeRange; source: 'top_short' | 'top_medium' | 'top_long' }> = [
  { range: 'short_term', source: 'top_short' },
  { range: 'medium_term', source: 'top_medium' },
  { range: 'long_term', source: 'top_long' },
];
const EMBEDDING_BATCH_SIZE = 16;
const CANDIDATE_ARTIST_LIMIT = 12;
const ALBUMS_PER_ARTIST = 3;
const TRACKS_PER_ALBUM = 8;

const api = new SpotifyApiService();
const credentials = new SpotifyCredentialsService(api);
const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export interface SpotifySyncResult {
  tracksUpserted: number;
  historyInserted: number;
  candidatesDiscovered: number;
  recommendationsGenerated: number;
}

async function resolveGithubToken(userId: string): Promise<string> {
  const [settings, systemSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);
  return settings?.github_token || systemSettings.github_token || process.env.GITHUB_TOKEN || '';
}

async function upsertTracks(tracks: SpotifyTrack[], genresByArtistId: Map<string, string[]>): Promise<void> {
  for (const track of tracks) {
    const genres = [...new Set(track.artists.flatMap((a) => genresByArtistId.get(a.id) || []))];
    await pool.query(
      `INSERT INTO spotify_tracks (id, name, artists, album_name, album_image_url, genres, popularity, preview_url, external_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         artists = EXCLUDED.artists,
         album_name = COALESCE(EXCLUDED.album_name, spotify_tracks.album_name),
         album_image_url = COALESCE(EXCLUDED.album_image_url, spotify_tracks.album_image_url),
         genres = CASE WHEN array_length(EXCLUDED.genres, 1) > 0 THEN EXCLUDED.genres ELSE spotify_tracks.genres END,
         popularity = EXCLUDED.popularity,
         preview_url = COALESCE(EXCLUDED.preview_url, spotify_tracks.preview_url),
         external_url = COALESCE(EXCLUDED.external_url, spotify_tracks.external_url),
         updated_at = NOW()`,
      [
        track.id,
        track.name,
        JSON.stringify(track.artists),
        track.albumName,
        track.albumImageUrl,
        genres,
        track.popularity,
        track.previewUrl,
        track.externalUrl,
      ],
    );
  }
}

async function embedMissingTracks(githubToken: string): Promise<number> {
  if (!githubToken) {
    console.warn('[Spotify] No GitHub token available — skipping embedding generation');
    return 0;
  }
  const missing = await pool.query<{ id: string; name: string; artists: Array<{ name: string }>; album_name: string | null; genres: string[] }>(
    `SELECT id, name, artists, album_name, genres FROM spotify_tracks WHERE embedding IS NULL LIMIT 500`,
  );
  if (missing.rows.length === 0) return 0;

  const embeddingService = new EmbeddingService(githubToken);
  let embedded = 0;
  for (let i = 0; i < missing.rows.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = missing.rows.slice(i, i + EMBEDDING_BATCH_SIZE);
    const texts = batch.map((t) => {
      const artistNames = (t.artists || []).map((a) => a.name).join(', ');
      const genreText = (t.genres || []).join(', ') || 'unknown';
      return `${t.name} by ${artistNames} — genres: ${genreText} — album: ${t.album_name || 'unknown'}`;
    });
    try {
      const results = await embeddingService.generateEmbeddingsBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        const embeddingString = `[${results[j].embedding.join(',')}]`;
        await pool.query('UPDATE spotify_tracks SET embedding = $1 WHERE id = $2', [embeddingString, batch[j].id]);
        embedded++;
      }
    } catch (error) {
      console.error('[Spotify] Embedding batch failed:', error instanceof Error ? error.message : error);
    }
  }
  return embedded;
}

async function insertHistory(
  userId: string,
  entries: Array<{ trackId: string; playedAt: string | null; source: string; rank: number | null }>,
): Promise<number> {
  let inserted = 0;
  for (const entry of entries) {
    const res = await pool.query(
      `INSERT INTO spotify_listening_history (user_id, track_id, played_at, source, rank)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, track_id, source, played_at) DO NOTHING`,
      [userId, entry.trackId, entry.playedAt, entry.source, entry.rank],
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

async function discoverCandidates(
  accessToken: string,
  topArtists: SpotifyArtist[],
  alreadyKnownTrackIds: Set<string>,
): Promise<{ tracks: SpotifyTrack[]; genresByArtistId: Map<string, string[]> }> {
  const genresByArtistId = new Map(topArtists.map((a) => [a.id, a.genres]));
  const artistsToExplore = topArtists.slice(0, CANDIDATE_ARTIST_LIMIT);
  const candidates: SpotifyTrack[] = [];
  const seen = new Set(alreadyKnownTrackIds);

  for (const artist of artistsToExplore) {
    try {
      const albums = await api.getArtistAlbums(accessToken, artist.id, ALBUMS_PER_ARTIST);
      for (const album of albums) {
        const tracks = await api.getAlbumTracks(accessToken, album.id, TRACKS_PER_ALBUM);
        for (const track of tracks) {
          if (seen.has(track.id)) continue;
          seen.add(track.id);
          candidates.push({ ...track, albumName: track.albumName ?? album.name });
        }
      }
    } catch (error) {
      console.error(`[Spotify] Candidate discovery failed for artist ${artist.id}:`, error instanceof Error ? error.message : error);
    }
  }

  return { tracks: candidates, genresByArtistId };
}

export async function runSpotifySync(userId: string): Promise<SpotifySyncResult> {
  const accessToken = await credentials.getValidAccessToken(userId);
  if (!accessToken) throw new Error('Spotify not connected');

  const [recentlyPlayed, topTracksByWindow, topArtistsByWindow] = await Promise.all([
    api.getRecentlyPlayed(accessToken, 50),
    Promise.all(TOP_WINDOWS.map((w) => api.getTopTracks(accessToken, w.range, 50))),
    Promise.all(TOP_WINDOWS.map((w) => api.getTopArtists(accessToken, w.range, 20))),
  ]);

  const allTopArtists = topArtistsByWindow.flat();
  const uniqueArtistGenres = new Map<string, string[]>(allTopArtists.map((a) => [a.id, a.genres]));

  // Enrich genres for artists behind recently-played tracks (top artists already have genres).
  // Best-effort: some Spotify apps (Development Mode / Basic quota) get 403s on the batch
  // "Get Several Artists" endpoint — genres are a nice-to-have for embeddings, not required.
  const recentArtistIds = [...new Set(recentlyPlayed.flatMap((item) => item.track.artists.map((a) => a.id)))]
    .filter((id) => !uniqueArtistGenres.has(id));
  if (recentArtistIds.length > 0) {
    try {
      const fetched = await api.getArtists(accessToken, recentArtistIds);
      for (const artist of fetched) uniqueArtistGenres.set(artist.id, artist.genres);
    } catch (error) {
      console.error('[Spotify] Artist genre enrichment failed (continuing without it):', error instanceof Error ? error.message : error);
    }
  }

  const knownTracks = new Map<string, SpotifyTrack>();
  for (const item of recentlyPlayed) knownTracks.set(item.track.id, item.track);
  for (const list of topTracksByWindow) for (const track of list) knownTracks.set(track.id, track);

  await upsertTracks([...knownTracks.values()], uniqueArtistGenres);

  const historyEntries: Array<{ trackId: string; playedAt: string | null; source: string; rank: number | null }> = [
    ...recentlyPlayed.map((item) => ({
      trackId: item.track.id,
      playedAt: item.playedAt,
      source: 'recently_played',
      rank: null,
    })),
  ];
  topTracksByWindow.forEach((tracks, windowIndex) => {
    tracks.forEach((track, rank) => {
      historyEntries.push({
        trackId: track.id,
        playedAt: null,
        source: TOP_WINDOWS[windowIndex].source,
        rank,
      });
    });
  });
  const historyInserted = await insertHistory(userId, historyEntries);

  const { tracks: candidateTracks, genresByArtistId } = await discoverCandidates(
    accessToken,
    allTopArtists,
    new Set(knownTracks.keys()),
  );
  if (candidateTracks.length > 0) {
    await upsertTracks(candidateTracks, genresByArtistId);
  }

  const githubToken = await resolveGithubToken(userId);
  await embedMissingTracks(githubToken);

  const recommendationsGenerated = await generateRecommendations(userId);
  await credentials.markSynced(userId);

  return {
    tracksUpserted: knownTracks.size + candidateTracks.length,
    historyInserted,
    candidatesDiscovered: candidateTracks.length,
    recommendationsGenerated,
  };
}
