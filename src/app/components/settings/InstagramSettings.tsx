'use client';

import { useState, useEffect } from 'react';
import * as instagramActions from '@/app/actions/instagram';

interface InstagramSettingsProps {
  userId?: string;
  isDarkMode: boolean;
}

type State = 'loading' | 'disconnected' | 'connected' | 'error';

export default function InstagramSettings({ userId, isDarkMode }: InstagramSettingsProps) {
  const [state,    setState]    = useState<State>('loading');
  const [username, setUsername] = useState('');
  const [expires,  setExpires]  = useState('');
  const [errMsg,   setErrMsg]   = useState('');
  const [message,  setMessage]  = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const muted   = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const card    = `rounded-xl border p-5 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`;
  const btn     = (v: 'primary' | 'danger' | 'ghost') => {
    const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    if (v === 'primary') return `${base} bg-brand-900 text-white hover:bg-brand-800`;
    if (v === 'danger')  return `${base} bg-red-600 text-white hover:bg-red-700`;
    return `${base} ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`;
  };

  useEffect(() => { if (userId) load(); }, [userId]);
  useEffect(() => { if (message) { const t = setTimeout(() => setMessage(null), 4000); return () => clearTimeout(t); } }, [message]);

  async function load() {
    setState('loading');
    const data = await instagramActions.getInstagramStatus(userId!);
    if (data.is_connected) {
      setUsername(data.username ?? '');
      setExpires(data.expires_at ? new Date(data.expires_at).toLocaleDateString() : 'No expiry');
      setState('connected');
    } else {
      setErrMsg(data.last_error ?? '');
      setState(data.last_error ? 'error' : 'disconnected');
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect your Instagram account?')) return;
    await instagramActions.disconnectInstagram(userId!);
    setUsername('');
    setState('disconnected');
    setMessage({ type: 'success', text: 'Instagram disconnected.' });
  }

  function handleConnect() {
    window.location.href = '/api/instagram/auth';
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          📸 Instagram
        </h3>
        <p className={`text-xs ${muted}`}>
          Connect your Instagram Business account to manage DMs, generate captions, and publish posts directly from Allerac.
        </p>
      </div>

      {message && (
        <div className={`text-xs px-3 py-2 rounded-md ${message.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {message.text}
        </div>
      )}

      {state === 'loading' && (
        <div className={`text-xs ${muted}`}>Loading…</div>
      )}

      {state === 'connected' && (
        <div className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold">
                {username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  @{username}
                </div>
                <div className={`text-xs ${muted}`}>
                  Token expires: {expires}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Connected
              </span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleDisconnect} className={btn('danger')}>
              Disconnect
            </button>
          </div>
        </div>
      )}

      {(state === 'disconnected' || state === 'error') && (
        <div className={card}>
          {state === 'error' && errMsg && (
            <div className="mb-3 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-md">
              Last error: {errMsg}
            </div>
          )}
          <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Connect an Instagram Business or Creator account to unlock DM automation, AI-generated captions, and post scheduling.
          </p>
          <div className="space-y-2">
            <button onClick={handleConnect} className={btn('primary')}>
              Connect Instagram
            </button>
            <p className={`text-xs ${muted}`}>
              You'll be redirected to Instagram to authorize access. Requires a Business or Creator account.
            </p>
          </div>
        </div>
      )}

      {state === 'connected' && (
        <div className={`text-xs ${muted} space-y-1`}>
          <p>✓ Caption & hashtag generation — available now in the Social domain</p>
          <p>✓ DM inbox & AI-drafted replies — available in Social → DM Manager</p>
          <p>◌ Post scheduling — coming soon</p>
        </div>
      )}
    </div>
  );
}
