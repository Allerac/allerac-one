'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import * as musicActions from '@/app/actions/music';

interface Props {
  isDarkMode: boolean;
  onViewChange?: (context: string) => void;
}

type Tab = 'recommendations' | 'top' | 'recent';

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
}: {
  dark: boolean;
  image: string | null;
  name: string;
  artists: Array<{ name: string }>;
  subtitle?: string;
  score?: number;
  rank?: number;
  externalUrl?: string | null;
}) {
  const content = (
    <div className={`flex items-center gap-3 p-2 rounded-lg ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}>
      {typeof rank === 'number' && (
        <span className={`w-5 text-right text-sm font-medium ${d ? 'text-gray-500' : 'text-gray-400'}`}>{rank}</span>
      )}
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
      {typeof score === 'number' && (
        <span className={`text-xs font-mono flex-shrink-0 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{Math.round(score * 100)}%</span>
      )}
    </div>
  );
  if (externalUrl) {
    return (
      <a href={externalUrl} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return content;
}
