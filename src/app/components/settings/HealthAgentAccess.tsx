'use client';

import { useEffect, useState } from 'react';

const PROXY_SCOPE = 'health:proxy:read';

interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface HealthAgentAccessProps {
  isDarkMode: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// Self-service revoke/create for the Garmin proxy scope only — no scope
// picker, so a domain-restricted user can manage their own agent access
// without needing the admin-only "Allerac API" tab (ControlApiAccessTab).
export default function HealthAgentAccess({ isDarkMode }: HealthAgentAccessProps) {
  const [keys, setKeys] = useState<ApiKeyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Health agent');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const input = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${
    isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const text = isDarkMode ? 'text-gray-200' : 'text-gray-800';

  const loadKeys = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/api-keys', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to load keys.');
      setKeys((body.data.apiKeys as ApiKeyDto[]).filter(key => key.scopes.includes(PROXY_SCOPE)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadKeys(); }, []);

  const activeKeys = keys.filter(key => !key.revokedAt);

  const createKey = async () => {
    if (!name.trim()) {
      setError('Enter a name for this key.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes: [PROXY_SCOPE] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to create key.');
      setCreatedSecret(body.data.secret);
      setKeys(current => [body.data.apiKey, ...current]);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key.');
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (key: ApiKeyDto) => {
    if (!window.confirm(`Revoke "${key.name}"? Any agent using it will stop working immediately.`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/v1/api-keys/${key.id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to revoke key.');
      const revokedAt = new Date().toISOString();
      setKeys(current => current.map(item => item.id === key.id ? { ...item, revokedAt } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key.');
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🔑</span>
        <div>
          <h3 className={`text-sm font-semibold ${text}`}>Health agent access</h3>
          <p className={`text-xs ${muted}`}>
            Lets an external agent read your connected Garmin data live — nothing is stored by Allerac.
          </p>
        </div>
      </div>

      {error && (
        <div className={`mb-3 p-2.5 rounded-md text-sm ${isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
          {error}
        </div>
      )}

      {createdSecret && (
        <div className={`mb-3 rounded-md border p-3 space-y-2 ${isDarkMode ? 'border-amber-500/50 bg-amber-500/10' : 'border-amber-300 bg-amber-50'}`}>
          <p className={`text-xs font-semibold ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>
            Copy this key now — it won&apos;t be shown again
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={createdSecret}
              onFocus={e => e.currentTarget.select()}
              className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-xs ${input}`}
            />
            <button
              type="button"
              onClick={async () => { await navigator.clipboard.writeText(createdSecret); setCopied(true); }}
              className="px-3 py-1.5 rounded-md bg-brand-900 text-white text-xs font-medium hover:bg-brand-800"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button type="button" onClick={() => setCreatedSecret(null)} className={`text-xs underline ${muted}`}>
            I saved the key
          </button>
        </div>
      )}

      {loading ? (
        <p className={`text-sm ${muted}`}>Loading…</p>
      ) : (
        <div className="space-y-2 mb-3">
          {activeKeys.length === 0 ? (
            <p className={`text-sm ${muted}`}>No agent keys yet.</p>
          ) : activeKeys.map(key => (
            <div key={key.id} className={`rounded-md border p-2.5 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${text}`}>{key.name}</p>
                  <p className={`text-xs ${muted}`}>{key.prefix}… · Last used: {formatDate(key.lastUsedAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => revokeKey(key)}
                  className={`text-xs font-medium flex-shrink-0 ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}`}
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          placeholder="Name this key (e.g. Backup key)"
          className={input}
        />
        <button
          type="button"
          disabled={creating}
          onClick={createKey}
          className="px-4 py-2 rounded-md bg-brand-900 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 flex-shrink-0"
        >
          {creating ? 'Creating…' : 'Create key'}
        </button>
      </div>
    </div>
  );
}
