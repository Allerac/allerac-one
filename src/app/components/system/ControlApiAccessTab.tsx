'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ControlApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ControlApiAccessTabProps {
  isDarkMode: boolean;
}

const SCOPE_GROUPS = [
  {
    label: 'Core',
    scopes: [
      ['profile:read', 'Profile: read'],
      ['domains:read', 'Domains: read'],
      ['capabilities:read', 'Capabilities: read'],
      ['chat:read', 'Chat: read'],
      ['chat:write', 'Chat: write'],
    ],
  },
  {
    label: 'Knowledge',
    scopes: [
      ['memory:read', 'Memory: read'],
      ['memory:write', 'Memory: write'],
      ['documents:read', 'Documents: read'],
      ['documents:write', 'Documents: write'],
      ['notes:read', 'Notes: read'],
      ['notes:write', 'Notes: write'],
      ['search:read', 'Search: run'],
    ],
  },
  {
    label: 'Automation',
    scopes: [
      ['tickets:read', 'Tickets: read'],
      ['tickets:write', 'Tickets: write'],
      ['agents:read', 'Agent runs: read'],
      ['agents:write', 'Agent runs: write'],
      ['jobs:read', 'Jobs: read'],
      ['jobs:write', 'Jobs: write'],
      ['skills:read', 'Skills: read'],
      ['skills:write', 'Skills: write'],
      ['benchmark:read', 'Benchmark: read'],
      ['benchmark:write', 'Benchmark: run'],
    ],
  },
  {
    label: 'Personal data',
    scopes: [
      ['health:read', 'Health: read'],
      ['email:read', 'Email: read'],
      ['email:write', 'Email: write'],
      ['finance:read', 'Finance: read'],
      ['finance:write', 'Finance: write'],
    ],
  },
] as const;

const PRESETS = {
  robot: {
    label: 'Android Robot',
    scopes: ['profile:read', 'chat:read', 'chat:write', 'capabilities:read'],
  },
  readonly: {
    label: 'Read only',
    scopes: [
      'profile:read',
      'domains:read',
      'capabilities:read',
      'chat:read',
      'memory:read',
      'documents:read',
      'notes:read',
      'tickets:read',
      'agents:read',
      'jobs:read',
      'skills:read',
      'benchmark:read',
      'health:read',
      'email:read',
      'finance:read',
    ],
  },
  automation: {
    label: 'Automation',
    scopes: [
      'profile:read',
      'domains:read',
      'capabilities:read',
      'chat:read',
      'chat:write',
      'tickets:read',
      'tickets:write',
      'agents:read',
      'agents:write',
      'jobs:read',
      'jobs:write',
      'benchmark:read',
      'benchmark:write',
    ],
  },
  custom: {
    label: 'Custom',
    scopes: [],
  },
} as const;

type PresetId = keyof typeof PRESETS;

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function ControlApiAccessTab({ isDarkMode }: ControlApiAccessTabProps) {
  const [keys, setKeys] = useState<ControlApiKeyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('Android Robot');
  const [preset, setPreset] = useState<PresetId>('robot');
  const [scopes, setScopes] = useState<string[]>([...PRESETS.robot.scopes]);
  const [expiresAt, setExpiresAt] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const createdSecretRef = useRef<HTMLDivElement>(null);

  const activeKeys = useMemo(() => keys.filter(key => !key.revokedAt), [keys]);
  const revokedKeys = useMemo(() => keys.filter(key => key.revokedAt), [keys]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/api-keys', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to load access keys.');
      setKeys(body.data.apiKeys);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load access keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  useEffect(() => {
    if (!createdSecret) return;

    const secretPanel = createdSecretRef.current;
    if (typeof secretPanel?.scrollIntoView === 'function') {
      secretPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [createdSecret]);

  const selectPreset = (value: PresetId) => {
    setPreset(value);
    setScopes([...PRESETS[value].scopes]);
    if (value === 'robot' && !name.trim()) setName('Android Robot');
  };

  const toggleScope = (scope: string) => {
    setPreset('custom');
    setScopes(current => current.includes(scope)
      ? current.filter(value => value !== scope)
      : [...current, scope]);
  };

  const createKey = async () => {
    if (!name.trim()) {
      setError('Enter a name for this device or integration.');
      return;
    }
    if (scopes.length === 0) {
      setError('Select at least one scope. Empty scope lists are not created from this UI.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setCreatedSecret(null);
    try {
      const response = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to create access key.');

      setCreatedSecret(body.data.secret);
      setKeys(current => [body.data.apiKey, ...current]);
      setCopied(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create access key.');
    } finally {
      setSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret);
    setCopied(true);
  };

  const revokeKey = async (key: ControlApiKeyDto) => {
    if (!window.confirm(`Revoke access key “${key.name}”? Connected clients will stop working.`)) {
      return;
    }

    setError(null);
    try {
      const response = await fetch(`/api/v1/api-keys/${key.id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Failed to revoke access key.');
      const revokedAt = new Date().toISOString();
      setKeys(current => current.map(item => item.id === key.id ? { ...item, revokedAt } : item));
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Failed to revoke access key.');
    }
  };

  const panel = isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50';
  const text = isDarkMode ? 'text-gray-200' : 'text-gray-800';
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const field = isDarkMode
    ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400'
    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400';

  return (
    <div className={`space-y-6 ${text}`}>
      <div>
        <h3 className={`text-base font-semibold ${text}`}>Allerac API Access</h3>
        <p className={`mt-1 text-sm ${muted}`}>
          Connect devices, applications, CLI clients, and automations to your account.
          Each key belongs to you and can be revoked independently.
        </p>
      </div>

      {error && (
        <div className={`rounded-md border p-3 text-sm ${isDarkMode ? 'border-red-500/40 bg-red-900/20 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {error}
        </div>
      )}

      {createdSecret && (
        <div
          ref={createdSecretRef}
          role="status"
          aria-live="polite"
          className={`rounded-md border p-4 space-y-3 ${isDarkMode ? 'border-amber-500/50 bg-amber-500/10' : 'border-amber-300 bg-amber-50'}`}
        >
          <div>
            <p className={`text-sm font-semibold ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>Copy this key now</p>
            <p className={`mt-1 text-xs ${muted}`}>
              This secret is shown only once. Allerac stores only its hash.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={createdSecret}
              className={`min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-xs ${field}`}
              onFocus={event => event.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copySecret}
              className="rounded-md bg-brand-900 px-3 py-2 text-sm text-white"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedSecret(null)}
            className={`text-xs underline ${muted}`}
          >
            I saved the key
          </button>
        </div>
      )}

      <div className={`rounded-lg border p-4 space-y-4 ${panel}`}>
        <div>
          <h3 className={text}>Create access key</h3>
          <p className={`mt-1 text-xs ${muted}`}>Use one key per device or integration.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span>Name</span>
            <input
              value={name}
              maxLength={100}
              onChange={event => setName(event.target.value)}
              placeholder="Android Robot"
              className={`w-full rounded-md border px-3 py-2 ${field}`}
            />
          </label>
          <label className="space-y-1">
            <span>Preset</span>
            <select
              value={preset}
              onChange={event => selectPreset(event.target.value as PresetId)}
              className={`w-full rounded-md border px-3 py-2 ${field}`}
            >
              {Object.entries(PRESETS).map(([id, item]) => (
                <option key={id} value={id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span>Expiration (optional)</span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={event => setExpiresAt(event.target.value)}
            className={`w-full rounded-md border px-3 py-2 sm:max-w-xs ${field}`}
          />
        </label>

        <div className="space-y-3">
          <div>
            <h3 className={text}>Permissions</h3>
            <p className={`mt-1 text-xs ${muted}`}>Choose the minimum access this client needs.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SCOPE_GROUPS.map(group => (
              <fieldset key={group.label} className="space-y-2">
                <legend className={`text-xs font-semibold ${text}`}>{group.label}</legend>
                {group.scopes.map(([scope, label]) => (
                  <label key={scope} className={`flex items-center gap-2 text-xs ${muted}`}>
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>{label}</span>
                    <code className="ml-auto text-[10px] opacity-60">{scope}</code>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={createKey}
          className="rounded-md bg-brand-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create key'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={text}>Your access keys</h3>
            <p className={`mt-1 text-xs ${muted}`}>Only prefixes are stored for identification.</p>
          </div>
          <button type="button" onClick={() => void loadKeys()} className={`text-xs underline ${muted}`}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p className={`text-sm ${muted}`}>Loading access keys…</p>
        ) : activeKeys.length === 0 ? (
          <div className={`rounded-md border p-4 text-sm ${panel} ${muted}`}>
            No active access keys.
          </div>
        ) : (
          <div className="space-y-2">
            {activeKeys.map(key => (
              <div key={key.id} className={`rounded-md border p-3 ${panel}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${text}`}>{key.name}</p>
                    <code className={`text-xs ${muted}`}>{key.prefix}…</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revokeKey(key)}
                    className={`text-xs font-medium ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}`}
                  >
                    Revoke
                  </button>
                </div>
                <div className={`mt-2 grid gap-1 text-xs sm:grid-cols-3 ${muted}`}>
                  <span>Created: {formatDate(key.createdAt)}</span>
                  <span>Last used: {formatDate(key.lastUsedAt)}</span>
                  <span>Expires: {formatDate(key.expiresAt)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {key.scopes.map(scope => (
                    <code key={scope} className={`rounded px-1.5 py-0.5 text-[10px] ${isDarkMode ? 'bg-black/20 text-gray-400' : 'bg-gray-200 text-gray-700'}`}>
                      {scope}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {revokedKeys.length > 0 && (
          <details className={`rounded-md border p-3 ${panel}`}>
            <summary className={`cursor-pointer text-xs ${muted}`}>
              Revoked keys ({revokedKeys.length})
            </summary>
            <div className="mt-2 space-y-1">
              {revokedKeys.map(key => (
                <div key={key.id} className={`flex justify-between text-xs ${muted}`}>
                  <span>{key.name} · {key.prefix}…</span>
                  <span>{formatDate(key.revokedAt)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
