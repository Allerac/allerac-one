'use client';

import { useEffect, useState } from 'react';
import * as stravaActions from '@/app/actions/strava';

interface Props {
  userId?: string;
  isDarkMode: boolean;
  onStatusChange?: (connected: boolean) => void;
}

export default function StravaSettings({ userId, isDarkMode, onStatusChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof stravaActions.getStravaStatus>> | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const next = await stravaActions.getStravaStatus();
      setStatus(next);
      onStatusChange?.(next.is_connected);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (userId) void load(); }, [userId]);

  async function sync() {
    setSyncing(true); setMessage(null);
    try {
      const result = await stravaActions.triggerStravaSync();
      setMessage(`${result.imported} Strava activities synchronized.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Strava sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    await stravaActions.disconnectStrava();
    setMessage('Strava disconnected. Imported history was kept.');
    await load();
  }

  const card = `p-4 rounded-lg border ${isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`;
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const button = 'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50';

  return (
    <div className={card}>
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fc4c02] text-sm font-bold text-white">S</span>
        <div>
          <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Strava</h3>
          <p className={`text-xs ${muted}`}>Sync activities, metrics, and routes</p>
        </div>
      </div>

      {message && <p className={`mb-3 text-sm ${muted}`}>{message}</p>}
      {loading ? <p className={`text-sm ${muted}`}>Checking status...</p> : status?.is_connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span className={`text-sm font-medium ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>
              {status.athlete_name || 'Strava athlete'} connected
            </span>
          </div>
          {status.last_sync_at && <p className={`text-xs ${muted}`}>Last sync: {new Date(status.last_sync_at).toLocaleString()}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={sync} disabled={syncing} className={`${button} ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'}`}>
              {syncing ? 'Syncing...' : 'Sync now'}
            </button>
            <button onClick={disconnect} className={`${button} bg-red-600 text-white hover:bg-red-700`}>Disconnect</button>
          </div>
        </div>
      ) : status?.configured ? (
        <div>
          <p className={`mb-3 text-sm ${muted}`}>Connect Strava to import your activity history into Health.</p>
          <a href="/api/strava/auth" className={`${button} inline-block bg-[#fc4c02] text-white hover:bg-[#e34402]`}>Connect with Strava</a>
        </div>
      ) : (
        <p className={`text-sm ${muted}`}>Configure STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REDIRECT_URI on this server.</p>
      )}
    </div>
  );
}
