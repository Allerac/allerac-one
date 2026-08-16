'use client';

import { useEffect, useState } from 'react';
import type { AgentScopeOption } from './AgentAccessPanel';

export const QUICK_TOKEN_HOURS = 6;
// Exact name used to tell quick tokens apart from permanent Agent access
// keys — both are plain control_api_keys rows, so this is the only signal.
export const QUICK_TOKEN_NAME = 'Quick token';

export interface QuickToken {
  secret: string;
  expiresAt: string;
}

// Shared with BridgeClient's "Copy agent prompt" — that flow mints its own
// quick token and embeds it directly in the copied instructions, so the
// whole "connect an agent" step is a single paste.
export async function createQuickToken(scopes: string[]): Promise<QuickToken> {
  const expiresAt = new Date(Date.now() + QUICK_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
  const response = await fetch('/api/v1/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: QUICK_TOKEN_NAME, scopes, expiresAt }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || 'Failed to create token.');
  return { secret: body.data.secret, expiresAt };
}

interface QuickTokenDto {
  id: string;
  name: string;
  prefix: string;
  revokedAt: string | null;
  expiresAt: string | null;
}

function isLive(token: QuickTokenDto): boolean {
  if (token.revokedAt) return false;
  if (!token.expiresAt) return true;
  return new Date(token.expiresAt).getTime() > Date.now();
}

function formatCountdown(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const h = Math.floor(diffMs / (1000 * 60 * 60));
  const m = Math.floor((diffMs / (1000 * 60)) % 60);
  return `Expires in ${h}h ${m}m`;
}

interface QuickTokenCardProps {
  isDarkMode: boolean;
  scopeOptions: AgentScopeOption[];
  connectedProviders: string[];
  onCreated?: () => void;
}

// The easy path: a short-lived token that's genuinely fine to paste directly
// into a chat with any AI — the security guarantee is "it stops working on
// its own soon", not "keep this secret forever". For real tool/agent
// integrations, point people at AgentAccessPanel + the agent instructions
// instead. Kept in its own list here (not mixed into AgentAccessPanel) so
// disposable tokens don't clutter the permanent-key list.
export default function QuickTokenCard({ isDarkMode, scopeOptions, connectedProviders, onCreated }: QuickTokenCardProps) {
  const availableScopes = scopeOptions.filter(o => connectedProviders.includes(o.provider));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<{ secret: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveTokens, setLiveTokens] = useState<QuickTokenDto[]>([]);

  const input = `min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-xs ${
    isDarkMode ? 'border-gray-600 bg-gray-900 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;
  const muted = isDarkMode ? 'text-teal-200/70' : 'text-teal-900/70';

  const loadLiveTokens = async () => {
    try {
      const response = await fetch('/api/v1/api-keys', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) return;
      setLiveTokens((body.data.apiKeys as QuickTokenDto[]).filter(k => k.name === QUICK_TOKEN_NAME && isLive(k)));
    } catch {
      // best-effort — the create/copy flow above still works without this list
    }
  };

  useEffect(() => { void loadLiveTokens(); }, []);

  const getToken = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await createQuickToken(availableScopes.map(o => o.scope));
      setToken(result);
      setCopied(false);
      await loadLiveTokens();
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token.');
    } finally {
      setCreating(false);
    }
  };

  const copyToken = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token.secret);
    setCopied(true);
  };

  const revokeToken = async (id: string) => {
    try {
      await fetch(`/api/v1/api-keys/${id}`, { method: 'DELETE' });
      setLiveTokens(current => current.filter(t => t.id !== id));
    } catch {
      // ignore — it'll still show as live until the page reloads, but the revoke usually succeeds
    }
  };

  return (
    <div className={`p-4 rounded-lg border-2 ${isDarkMode ? 'border-teal-500/40 bg-teal-500/5' : 'border-teal-300 bg-teal-50'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">⚡</span>
        <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-teal-300' : 'text-teal-800'}`}>Quick token</h3>
      </div>
      <p className={`text-xs mb-3 ${isDarkMode ? 'text-teal-200/80' : 'text-teal-900/80'}`}>
        Safe to paste directly into a chat with any AI — it stops working on its own after
        {' '}{QUICK_TOKEN_HOURS} hours, no setup needed.
      </p>

      {availableScopes.length === 0 ? (
        <p className={`text-sm ${muted}`}>Connect a service above first.</p>
      ) : (
        <>
          {error && (
            <div className={`mb-2 p-2 rounded-md text-sm ${isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}

          {token ? (
            <div className="space-y-2 mb-3">
              <div className="flex gap-2">
                <input readOnly value={token.secret} onFocus={e => e.currentTarget.select()} className={input} />
                <button
                  type="button"
                  onClick={copyToken}
                  className="px-3 py-1.5 rounded-md bg-teal-700 text-white text-xs font-medium hover:bg-teal-600 flex-shrink-0"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className={`text-xs ${muted}`}>
                Expires {new Date(token.expiresAt).toLocaleString()}. Need another? Just click below again.
              </p>
              <button
                type="button"
                disabled={creating}
                onClick={getToken}
                className={`text-xs underline ${isDarkMode ? 'text-teal-300' : 'text-teal-800'}`}
              >
                Get a new one
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={creating}
              onClick={getToken}
              className="px-4 py-2 rounded-md bg-teal-700 text-white text-sm font-semibold hover:bg-teal-600 disabled:opacity-50 mb-3"
            >
              {creating ? 'Creating…' : `Get a quick token (${QUICK_TOKEN_HOURS}h)`}
            </button>
          )}

          {liveTokens.length > 0 && (
            <div className={`pt-3 border-t ${isDarkMode ? 'border-teal-500/20' : 'border-teal-200'} space-y-1.5`}>
              <p className={`text-xs font-medium ${muted}`}>Active quick tokens</p>
              {liveTokens.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className={muted}>{t.prefix}… · {formatCountdown(t.expiresAt)}</span>
                  <button
                    type="button"
                    onClick={() => revokeToken(t.id)}
                    className={isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
