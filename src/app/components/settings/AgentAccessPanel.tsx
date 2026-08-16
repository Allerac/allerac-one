'use client';

import { useEffect, useState } from 'react';

export interface AgentScopeOption {
  scope: string;
  label: string;
  provider: string;
}

// Quick tokens (QuickTokenCard.tsx) are plain control_api_keys rows created
// with this exact name — excluded here so disposable, short-lived tokens
// don't clutter the permanent-key list. Kept as a literal (not a shared
// import) to avoid a circular dependency between the two components.
const QUICK_TOKEN_NAME = 'Quick token';

interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const EXPIRATION_OPTIONS = [
  { value: '', label: 'Never expires' },
  { value: '7', label: 'In 7 days' },
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
] as const;

interface AgentAccessPanelProps {
  isDarkMode: boolean;
  /** All scopes this panel could ever offer, across every proxy-capable provider. */
  scopeOptions: AgentScopeOption[];
  /** Providers the user currently has connected — gates which scopeOptions are selectable. */
  connectedProviders: string[];
  title?: string;
  description?: string;
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatExpiry(expiresAt: string | null): { text: string; expired: boolean } | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return { text: 'Expired', expired: true };
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 48) {
    const h = Math.floor(hours);
    const m = Math.floor((diffMs / (1000 * 60)) % 60);
    return { text: `Expires in ${h}h ${m}m`, expired: false };
  }
  return { text: `Expires ${date.toLocaleDateString()}`, expired: false };
}

// Self-service revoke/create for proxy scopes only — no free-form scope
// picker, so a connection-only user can manage their own agent access
// without needing the admin-only "Allerac API" tab (ControlApiAccessTab).
// Used both by the Health dashboard's settings modal (Garmin only) and the
// standalone /bridge screen (every connected provider).
export default function AgentAccessPanel({
  isDarkMode,
  scopeOptions,
  connectedProviders,
  title = 'Agent access',
  description = 'Lets an external agent read your connected data live — nothing is stored by Allerac.',
}: AgentAccessPanelProps) {
  const availableScopes = scopeOptions.filter(o => connectedProviders.includes(o.provider));
  const allScopeValues = scopeOptions.map(o => o.scope);

  const [keys, setKeys] = useState<ApiKeyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Agent key');
  const [selectedScope, setSelectedScope] = useState(availableScopes[0]?.scope ?? '');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!availableScopes.some(o => o.scope === selectedScope)) {
      setSelectedScope(availableScopes[0]?.scope ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedProviders.join(',')]);

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
      setKeys((body.data.apiKeys as ApiKeyDto[]).filter(
        key => key.name !== QUICK_TOKEN_NAME && key.scopes.some(s => allScopeValues.includes(s)),
      ));
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
    if (!selectedScope) {
      setError('Connect a service above first.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const expiresAt = expiresInDays
        ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const response = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes: [selectedScope], expiresAt }),
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
          <h3 className={`text-sm font-semibold ${text}`}>{title}</h3>
          <p className={`text-xs ${muted}`}>{description}</p>
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
          ) : activeKeys.map(key => {
            const expiry = formatExpiry(key.expiresAt);
            return (
            <div key={key.id} className={`rounded-md border p-2.5 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`text-sm font-medium truncate ${text}`}>{key.name}</p>
                    {expiry && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                        expiry.expired
                          ? isDarkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'
                          : isDarkMode ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {expiry.text}
                      </span>
                    )}
                  </div>
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
            );
          })}
        </div>
      )}

      {availableScopes.length === 0 ? (
        <p className={`text-sm ${muted}`}>Connect a service above to create an agent key.</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          {availableScopes.length > 1 && (
            <select
              value={selectedScope}
              onChange={e => setSelectedScope(e.target.value)}
              className={`${input} sm:w-48 flex-shrink-0`}
            >
              {availableScopes.map(o => (
                <option key={o.scope} value={o.scope}>{o.label}</option>
              ))}
            </select>
          )}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            placeholder="Name this key (e.g. Backup key)"
            className={input}
          />
          <select
            value={expiresInDays}
            onChange={e => setExpiresInDays(e.target.value)}
            className={`${input} sm:w-40 flex-shrink-0`}
          >
            {EXPIRATION_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={creating}
            onClick={createKey}
            className="px-4 py-2 rounded-md bg-brand-900 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 flex-shrink-0"
          >
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </div>
      )}
    </div>
  );
}
