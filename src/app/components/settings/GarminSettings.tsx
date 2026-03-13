'use client';

import { useState, useEffect } from 'react';
import * as healthActions from '@/app/actions/health';

interface GarminSettingsProps {
  userId?: string;
  isDarkMode: boolean;
}

type State = 'loading' | 'disconnected' | 'connecting' | 'mfa_required' | 'connected' | 'error';

export default function GarminSettings({ userId, isDarkMode }: GarminSettingsProps) {
  const [state, setState] = useState<State>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMessage, setMfaMessage] = useState('');
  const [connectedEmail, setConnectedEmail] = useState('');
  const [lastSync, setLastSync] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const input = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${
    isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;

  const btn = (variant: 'primary' | 'danger' | 'ghost') => {
    const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    if (variant === 'primary') return `${base} bg-brand-900 text-white hover:bg-brand-800`;
    if (variant === 'danger')  return `${base} bg-red-600 text-white hover:bg-red-700`;
    return `${base} ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`;
  };

  useEffect(() => {
    if (userId) loadStatus();
  }, [userId]);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  async function loadStatus() {
    setState('loading');
    const data = await healthActions.getGarminStatus(userId!);
    if (data.not_configured) { setState('disconnected'); return; }
    if (data.is_connected) {
      setConnectedEmail(data.email || '');
      setLastSync(data.last_sync_at ? new Date(data.last_sync_at).toLocaleString() : '');
      setState('connected');
    } else {
      setState('disconnected');
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setState('connecting');
    setMessage(null);
    try {
      const data = await healthActions.connectGarmin(userId!, email, password);
      if (data.mfa_pending) {
        setMfaMessage(data.message || 'Check your email or phone for the MFA code.');
        setState('mfa_required');
      } else if (data.is_connected) {
        setPassword('');
        await loadStatus();
        setMessage({ type: 'success', text: 'Garmin connected successfully.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Connection failed.' });
      setState('error');
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setState('connecting');
    try {
      const data = await healthActions.submitGarminMfa(userId!, mfaCode);
      if (data.is_connected) {
        setEmail(''); setPassword(''); setMfaCode('');
        await loadStatus();
        setMessage({ type: 'success', text: 'Garmin connected successfully.' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Invalid MFA code.' });
      setState('mfa_required');
    }
  }

  async function handleDisconnect() {
    try {
      await healthActions.disconnectGarmin(userId!);
      setState('disconnected');
      setMessage({ type: 'success', text: 'Garmin disconnected.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  }

  async function handleSync() {
    try {
      await healthActions.triggerHealthSync(userId!);
      setMessage({ type: 'success', text: 'Sync started. Data will update in a few minutes.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  }

  const label = `block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const hint  = `text-xs mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;

  return (
    <div className={`p-4 rounded-lg border ${isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">⌚</span>
        <div>
          <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            Garmin Connect
          </h3>
          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Sync your health data to use the Health Assistant
          </p>
        </div>
      </div>

      {message && (
        <div className={`mb-3 p-2.5 rounded-md text-sm ${
          message.type === 'success'
            ? isDarkMode ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
            : isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {state === 'loading' && (
        <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Checking status...</div>
      )}

      {state === 'connected' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span className={`text-sm font-medium ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>Connected</span>
            {connectedEmail && <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>({connectedEmail})</span>}
          </div>
          {lastSync && <p className={hint}>Last sync: {lastSync}</p>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSync} className={btn('ghost')}>Sync now</button>
            <button onClick={handleDisconnect} className={btn('danger')}>Disconnect</button>
          </div>
        </div>
      )}

      {(state === 'disconnected' || state === 'error') && (
        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label className={label}>Garmin Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your-garmin@email.com" required className={input} />
          </div>
          <div>
            <label className={label}>Garmin Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Your Garmin password" required className={input} />
          </div>
          <p className={hint}>Your credentials are encrypted and used only to fetch health data.</p>
          <button type="submit" className={btn('primary')}>Connect Garmin</button>
        </form>
      )}

      {state === 'connecting' && (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-500"></div>
          <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Connecting...</span>
        </div>
      )}

      {state === 'mfa_required' && (
        <form onSubmit={handleMfa} className="space-y-3">
          <p className={`text-sm ${isDarkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
            🔐 {mfaMessage}
          </p>
          <div>
            <label className={label}>MFA Code</label>
            <input type="text" value={mfaCode} onChange={e => setMfaCode(e.target.value)}
              placeholder="123456" required maxLength={6}
              className={`${input} text-center text-xl tracking-widest`} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={btn('primary')}>Verify</button>
            <button type="button" onClick={() => { setState('disconnected'); setMfaCode(''); }}
              className={btn('ghost')}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
