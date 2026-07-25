'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import * as musicActions from '@/app/actions/music';

interface Props {
  isDarkMode: boolean;
  onViewChange?: (context: string) => void;
}

type Tab = 'recommendations' | 'top' | 'recent' | 'playlists';

function ArtistNames({ artists }: { artists: Array<{ name: string }> }) {
  return <>{(artists || []).map((a) => a.name).join(', ')}</>;
}

export default function MusicDashboard({ isDarkMode: d, onViewChange }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [status, setStatus] = useState<musicActions.SpotifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('recommendations');
  const [recommendations, setRecommendations] = useState<musicActions.RecommendationRow[]>([]);
  const [topTracks, setTopTracks] = useState<musicActions.TopTrackRow[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<musicActions.RecentlyPlayedRow[]>([]);
  const [playlists, setPlaylists] = useState<musicActions.SpotifyPlaylistOption[]>([]);
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  const banner = searchParams?.get('spotify') ?? null;

  const loadStatus = useCallback(async () => {
    const s = await musicActions.getSpotifyStatus();
    setStatus(s);
    return s;
  }, []);

  const loadData = useCallback(async () => {
    const [recs, top, recent] = await Promise.all([
      musicActions.getRecommendations(30),
      musicActions.getTopTracks('top_medium', 20),
      musicActions.getRecentlyPlayed(20),
    ]);
    setRecommendations(recs);
    setTopTracks(top);
    setRecentlyPlayed(recent);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const s = await loadStatus();
      if (s.is_connected) await loadData();
      setLoading(false);
    })();
  }, [loadStatus, loadData]);

  useEffect(() => {
    if (!status) return;
    onViewChange?.(
      status.is_connected
        ? `## Music dashboard context\nThe user has Spotify connected and is viewing the "${tab}" tab, with ${recommendations.length} recommendations available. Reference these when suggesting what to listen to.`
        : '## Music dashboard context\nThe user has not connected Spotify yet — recommendations are unavailable until they connect it from the dashboard.',
    );
  }, [status, tab, recommendations.length, onViewChange]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await musicActions.triggerSpotifySync();
      setSyncMessage(`Synced ${result.tracksUpserted} tracks, generated ${result.recommendationsGenerated} recommendations.`);
      await loadStatus();
      await loadData();
    } catch (e: any) {
      setSyncMessage(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    await musicActions.disconnectSpotify();
    await loadStatus();
    setRecommendations([]);
    setTopTracks([]);
    setRecentlyPlayed([]);
  };

  const dismissBanner = () => router.replace(pathname || '/music');

  const hasPlaylistWriteScope = Boolean(status?.scopes?.includes('playlist-modify'));

  const loadPlaylists = useCallback(async () => {
    if (playlistsLoaded) return;
    setPlaylistsLoading(true);
    try {
      const p = await musicActions.getSpotifyPlaylists();
      setPlaylists(p);
      setPlaylistsLoaded(true);
    } catch {
      // best-effort — the "+" menu will just show an empty list
    } finally {
      setPlaylistsLoading(false);
    }
  }, [playlistsLoaded]);

  useEffect(() => {
    if (tab === 'playlists') loadPlaylists();
  }, [tab, loadPlaylists]);

  const handleAddToPlaylist = async (playlistId: string, trackId: string) => {
    await musicActions.addTrackToSpotifyPlaylist(playlistId, trackId);
  };

  const handleCreatePlaylist = async (name: string, trackId: string) => {
    const playlist = await musicActions.createSpotifyPlaylist(name, trackId);
    setPlaylists((prev) => [
      { id: playlist.id, name: playlist.name, imageUrl: null, trackCount: 1, externalUrl: playlist.externalUrl },
      ...prev,
    ]);
  };

  if (loading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${d ? 'bg-gray-900 text-gray-400' : 'bg-white text-gray-500'}`}>
        Loading…
      </div>
    );
  }

  if (!status?.is_connected) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center px-6 ${d ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="text-5xl mb-4">🎵</div>
        <h2 className={`text-xl font-bold mb-2 ${d ? 'text-gray-100' : 'text-gray-900'}`}>Connect Spotify</h2>
        <p className={`text-sm text-center max-w-sm mb-6 ${d ? 'text-gray-400' : 'text-gray-600'}`}>
          Connect your Spotify account so Allerac can build recommendations from your own listening
          history, using its own algorithm instead of Spotify&apos;s.
        </p>
        {banner === 'error' && (
          <p className="text-sm text-red-500 mb-4">Something went wrong connecting Spotify. Please try again.</p>
        )}
        {banner === 'not_configured' && (
          <p className={`text-sm mb-4 max-w-sm text-center ${d ? 'text-amber-400' : 'text-amber-600'}`}>
            Spotify isn&apos;t configured on this server yet. An admin needs to set SPOTIFY_CLIENT_ID,
            SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.
          </p>
        )}
        {!status?.configured ? (
          <span className={`text-sm ${d ? 'text-gray-500' : 'text-gray-400'}`}>Spotify integration not configured.</span>
        ) : (
          <a
            href="/api/spotify/auth"
            className="px-5 py-2.5 rounded-full bg-[#1DB954] text-white text-sm font-semibold hover:bg-[#1ed760] transition-colors"
          >
            Connect Spotify
          </a>
        )}
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'recommendations', label: 'For You' },
    { id: 'top', label: 'Top Tracks' },
    { id: 'recent', label: 'Recently Played' },
    { id: 'playlists', label: 'Playlists' },
  ];

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${d ? 'bg-gray-900' : 'bg-white'}`}>
      <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        <div>
          <h1 className={`text-base font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>
            {status.display_name || 'Spotify'} connected
          </h1>
          <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-500'}`}>
            {status.last_sync_at ? `Last synced ${new Date(status.last_sync_at).toLocaleString()}` : 'Never synced'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              syncing
                ? 'bg-gray-500 text-white cursor-wait'
                : 'bg-[#1DB954] text-white hover:bg-[#1ed760]'
            }`}
          >
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          <button
            onClick={handleDisconnect}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              d ? 'border-gray-700 text-gray-400 hover:bg-gray-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            Disconnect
          </button>
        </div>
      </div>

      {(syncMessage || banner === 'connected') && (
        <div className={`flex-shrink-0 px-4 py-2 text-xs flex items-center justify-between ${d ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'}`}>
          <span>{syncMessage || 'Spotify connected! Click "Sync Now" to pull your listening history.'}</span>
          <button onClick={() => { setSyncMessage(null); dismissBanner(); }} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <div className={`flex-shrink-0 flex items-center gap-1 px-4 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? `border-blue-500 ${d ? 'text-white' : 'text-gray-900'}`
                : `border-transparent ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'recommendations' && (
          recommendations.length === 0 ? (
            <EmptyState dark={d} message="No recommendations yet — click Sync Now to generate them." />
          ) : (
            <div className="space-y-2">
              {recommendations.map((r) => (
                <TrackRow
                  key={r.track_id}
                  dark={d}
                  image={r.album_image_url}
                  name={r.name}
                  artists={r.artists}
                  externalUrl={r.external_url}
                  subtitle={r.reason || undefined}
                  score={r.score}
                  trackId={r.track_id}
                  canAddToPlaylist={hasPlaylistWriteScope}
                  playlists={playlists}
                  onOpenPlaylistMenu={loadPlaylists}
                  onCreatePlaylist={handleCreatePlaylist}
                  onAddToPlaylist={handleAddToPlaylist}
                />
              ))}
            </div>
          )
        )}

        {tab === 'top' && (
          topTracks.length === 0 ? (
            <EmptyState dark={d} message="No top tracks synced yet." />
          ) : (
            <div className="space-y-2">
              {topTracks.map((t, i) => (
                <TrackRow
                  key={t.track_id}
                  dark={d}
                  image={t.album_image_url}
                  name={t.name}
                  artists={t.artists}
                  rank={t.rank ?? i + 1}
                  externalUrl={t.external_url}
                  trackId={t.track_id}
                  canAddToPlaylist={hasPlaylistWriteScope}
                  playlists={playlists}
                  onOpenPlaylistMenu={loadPlaylists}
                  onCreatePlaylist={handleCreatePlaylist}
                  onAddToPlaylist={handleAddToPlaylist}
                />
              ))}
            </div>
          )
        )}

        {tab === 'recent' && (
          recentlyPlayed.length === 0 ? (
            <EmptyState dark={d} message="No recently played tracks synced yet." />
          ) : (
            <div className="space-y-2">
              {recentlyPlayed.map((t, i) => (
                <TrackRow
                  key={`${t.track_id}-${t.played_at ?? i}`}
                  dark={d}
                  image={t.album_image_url}
                  name={t.name}
                  artists={t.artists}
                  subtitle={t.played_at ? new Date(t.played_at).toLocaleString() : undefined}
                  externalUrl={t.external_url}
                  trackId={t.track_id}
                  canAddToPlaylist={hasPlaylistWriteScope}
                  playlists={playlists}
                  onOpenPlaylistMenu={loadPlaylists}
                  onCreatePlaylist={handleCreatePlaylist}
                  onAddToPlaylist={handleAddToPlaylist}
                />
              ))}
            </div>
          )
        )}

        {tab === 'playlists' && (
          playlistsLoading ? (
            <div className={`text-sm text-center py-12 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Loading…</div>
          ) : playlists.length === 0 ? (
            <EmptyState dark={d} message="No playlists found." />
          ) : (
            <div className="space-y-2">
              {playlists.map((p) => (
                <PlaylistRow
                  key={p.id}
                  dark={d}
                  playlist={p}
                  canAddToPlaylist={hasPlaylistWriteScope}
                  allPlaylists={playlists}
                  onOpenPlaylistMenu={loadPlaylists}
                  onCreatePlaylist={handleCreatePlaylist}
                  onAddToPlaylist={handleAddToPlaylist}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function EmptyState({ dark: d, message }: { dark: boolean; message: string }) {
  return (
    <div className={`text-sm text-center py-12 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{message}</div>
  );
}

function TrackRow({
  dark: d, image, name, artists, subtitle, score, rank, externalUrl,
  trackId, canAddToPlaylist, playlists, onOpenPlaylistMenu, onCreatePlaylist, onAddToPlaylist,
}: {
  dark: boolean;
  image: string | null;
  name: string;
  artists: Array<{ name: string }>;
  subtitle?: string;
  score?: number;
  rank?: number;
  externalUrl?: string | null;
  trackId?: string;
  canAddToPlaylist?: boolean;
  playlists?: musicActions.SpotifyPlaylistOption[];
  onOpenPlaylistMenu?: () => void;
  onCreatePlaylist?: (name: string, trackId: string) => Promise<void>;
  onAddToPlaylist?: (playlistId: string, trackId: string) => Promise<void>;
}) {
  const info = (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
      ) : (
        <div className={`w-10 h-10 rounded flex-shrink-0 flex items-center justify-center text-lg ${d ? 'bg-gray-800' : 'bg-gray-100'}`}>🎵</div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${d ? 'text-gray-100' : 'text-gray-900'}`}>{name}</p>
        <p className={`text-xs truncate ${d ? 'text-gray-400' : 'text-gray-600'}`}>
          <ArtistNames artists={artists} />
          {subtitle ? ` · ${subtitle}` : ''}
        </p>
      </div>
    </div>
  );

  return (
    <div className={`flex items-center gap-3 p-2 rounded-lg ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}>
      {typeof rank === 'number' && (
        <span className={`w-5 text-right text-sm font-medium flex-shrink-0 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{rank}</span>
      )}
      {externalUrl ? (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center min-w-0 flex-1">
          {info}
        </a>
      ) : (
        info
      )}
      {typeof score === 'number' && (
        <span className={`text-xs font-mono flex-shrink-0 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{Math.round(score * 100)}%</span>
      )}
      {trackId && canAddToPlaylist && onCreatePlaylist && onAddToPlaylist && (
        <AddToPlaylistMenu
          dark={d}
          trackId={trackId}
          playlists={playlists ?? []}
          onOpen={onOpenPlaylistMenu ?? (() => {})}
          onCreatePlaylist={onCreatePlaylist}
          onAddToPlaylist={onAddToPlaylist}
        />
      )}
      {trackId && !canAddToPlaylist && (
        <a
          href="/api/spotify/auth"
          title="Reconnect Spotify to enable adding tracks to playlists"
          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm ${d ? 'text-gray-700 hover:text-gray-500' : 'text-gray-300 hover:text-gray-400'}`}
        >
          +
        </a>
      )}
    </div>
  );
}

function PlaylistRow({
  dark: d, playlist, canAddToPlaylist, allPlaylists, onOpenPlaylistMenu, onCreatePlaylist, onAddToPlaylist,
}: {
  dark: boolean;
  playlist: musicActions.SpotifyPlaylistOption;
  canAddToPlaylist: boolean;
  allPlaylists: musicActions.SpotifyPlaylistOption[];
  onOpenPlaylistMenu: () => void;
  onCreatePlaylist: (name: string, trackId: string) => Promise<void>;
  onAddToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tracksLoaded, setTracksLoaded] = useState(false);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracks, setTracks] = useState<musicActions.PlaylistTrackRow[]>([]);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !tracksLoaded) {
      setTracksLoading(true);
      try {
        const t = await musicActions.getSpotifyPlaylistTracks(playlist.id);
        setTracks(t);
        setTracksLoaded(true);
      } catch {
        // best-effort — expanding will just show "No tracks found"
      } finally {
        setTracksLoading(false);
      }
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
      >
        <span className={`flex-shrink-0 text-xs w-3 transition-transform ${expanded ? 'rotate-90' : ''} ${d ? 'text-gray-500' : 'text-gray-400'}`}>▸</span>
        {playlist.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={playlist.imageUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
        ) : (
          <div className={`w-10 h-10 rounded flex-shrink-0 flex items-center justify-center text-lg ${d ? 'bg-gray-800' : 'bg-gray-100'}`}>🎵</div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium truncate ${d ? 'text-gray-100' : 'text-gray-900'}`}>{playlist.name}</p>
          <p className={`text-xs truncate ${d ? 'text-gray-400' : 'text-gray-600'}`}>
            {playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'}
          </p>
        </div>
        {playlist.externalUrl && (
          <a
            href={playlist.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open in Spotify"
            className={`flex-shrink-0 text-xs px-1 ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
          >
            ↗
          </a>
        )}
      </div>
      {expanded && (
        <div className="pl-7 pb-1 space-y-1">
          {tracksLoading ? (
            <div className={`text-xs py-2 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Loading…</div>
          ) : tracks.length === 0 ? (
            <div className={`text-xs py-2 ${d ? 'text-gray-500' : 'text-gray-400'}`}>No tracks found.</div>
          ) : (
            tracks.map((t) => (
              <TrackRow
                key={t.track_id}
                dark={d}
                image={t.album_image_url}
                name={t.name}
                artists={t.artists}
                externalUrl={t.external_url}
                trackId={t.track_id}
                canAddToPlaylist={canAddToPlaylist}
                playlists={allPlaylists}
                onOpenPlaylistMenu={onOpenPlaylistMenu}
                onCreatePlaylist={onCreatePlaylist}
                onAddToPlaylist={onAddToPlaylist}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AddToPlaylistMenu({
  dark: d,
  trackId,
  playlists,
  onOpen,
  onCreatePlaylist,
  onAddToPlaylist,
}: {
  dark: boolean;
  trackId: string;
  playlists: musicActions.SpotifyPlaylistOption[];
  onOpen: () => void;
  onCreatePlaylist: (name: string, trackId: string) => Promise<void>;
  onAddToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState({ top: 0, left: 0 });
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setStyle({ top: rect.bottom + 4, left: Math.max(8, rect.right - 240) });
    setIsOpen(true);
    onOpen();
  };
  const close = () => {
    setIsOpen(false);
    setResult(null);
    setNewName('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = () => close();
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [isOpen]);

  const handleAdd = async (playlist: musicActions.SpotifyPlaylistOption) => {
    setBusy(true);
    setResult(null);
    try {
      await onAddToPlaylist(playlist.id, trackId);
      setResult({ type: 'success', message: `Added to "${playlist.name}"` });
      setTimeout(close, 1100);
    } catch (e: any) {
      setResult({ type: 'error', message: e.message || 'Failed to add' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setResult(null);
    try {
      await onCreatePlaylist(name, trackId);
      setResult({ type: 'success', message: `Created "${name}" and added the track` });
      setTimeout(close, 1100);
    } catch (e: any) {
      setResult({ type: 'error', message: e.message || 'Failed to create' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); isOpen ? close() : open(); }}
        title="Add to playlist"
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm transition-colors ${
          d ? 'text-gray-500 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        +
      </button>
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: style.top, left: style.left, width: 240, zIndex: 9999 }}
          className={`rounded-lg border shadow-lg max-h-80 overflow-y-auto ${d ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'}`}
        >
          {result?.type === 'success' ? (
            <div className={`flex items-center gap-2 px-3 py-4 text-sm font-medium ${d ? 'text-green-400' : 'text-green-600'}`}>
              <span className="text-lg">✓</span>
              <span>{result.message}</span>
            </div>
          ) : (
            <>
              <div className={`px-3 py-2 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex gap-1">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder="New playlist name"
                    className={`flex-1 min-w-0 text-xs px-2 py-1 rounded border ${d ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`}
                  />
                  <button
                    onClick={handleCreate}
                    disabled={busy || !newName.trim()}
                    className="px-2 py-1 rounded text-xs font-medium bg-[#1DB954] text-white disabled:opacity-50 flex-shrink-0"
                  >
                    Create
                  </button>
                </div>
              </div>
              {playlists.length === 0 ? (
                <div className={`px-3 py-2 text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>No playlists yet</div>
              ) : (
                playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAdd(p)}
                    disabled={busy}
                    className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${d ? 'hover:bg-gray-700 text-gray-100' : 'hover:bg-gray-100 text-gray-900'}`}
                  >
                    {p.name}
                  </button>
                ))
              )}
              {result?.type === 'error' && (
                <div className={`px-3 py-1.5 text-xs border-t ${d ? 'border-red-900/50 text-red-400' : 'border-red-200 text-red-600'}`}>
                  {result.message}
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
