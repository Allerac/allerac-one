'use client';

import { useState } from 'react';

export interface ApiConsoleParam {
  name: string;
  required?: boolean;
  placeholder?: string;
}

export interface ApiConsoleEndpoint {
  id: string;
  provider: string;
  label: string;
  method: 'GET';
  path: string;
  params?: ApiConsoleParam[];
}

interface ApiConsoleProps {
  isDarkMode: boolean;
  endpoints: ApiConsoleEndpoint[];
  connectedProviders: string[];
}

interface ApiResult {
  status: number;
  ok: boolean;
  body: string;
  durationMs: number;
}

// A tiny in-page "try it out" console for the proxy endpoints this account
// can call — no Bruno/curl needed for a quick check. Requests go straight
// from the browser to Allerac's own API using a key the user pastes in;
// nothing here ever sees or stores that secret beyond the request itself.
export default function ApiConsole({ isDarkMode, endpoints, connectedProviders }: ApiConsoleProps) {
  const available = endpoints.filter(e => connectedProviders.includes(e.provider));
  const [selectedId, setSelectedId] = useState(available[0]?.id ?? '');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = available.find(e => e.id === selectedId) ?? available[0];

  const input = `w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono ${
    isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;
  const label = `block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const text = isDarkMode ? 'text-gray-200' : 'text-gray-800';

  const selectEndpoint = (id: string) => {
    setSelectedId(id);
    setParamValues({});
    setResult(null);
    setError(null);
  };

  const buildUrl = (endpoint: ApiConsoleEndpoint): string => {
    const url = new URL(endpoint.path, window.location.origin);
    for (const param of endpoint.params ?? []) {
      const value = paramValues[param.name]?.trim();
      if (value) url.searchParams.set(param.name, value);
    }
    return url.pathname + url.search;
  };

  const send = async () => {
    if (!selected) return;
    const missing = (selected.params ?? []).filter(p => p.required && !paramValues[p.name]?.trim());
    if (missing.length > 0) {
      setError(`Missing required param: ${missing.map(p => p.name).join(', ')}`);
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    const startedAt = performance.now();
    try {
      const response = await fetch(buildUrl(selected), {
        method: selected.method,
        headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {},
        cache: 'no-store',
      });
      const bodyText = await response.text();
      let pretty = bodyText;
      try {
        pretty = JSON.stringify(JSON.parse(bodyText), null, 2);
      } catch {
        // not JSON — show as-is
      }
      setResult({ status: response.status, ok: response.ok, body: pretty, durationMs: Math.round(performance.now() - startedAt) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🧪</span>
        <div>
          <h3 className={`text-sm font-semibold ${text}`}>Try it out</h3>
          <p className={`text-xs ${muted}`}>Test a proxy endpoint with one of your agent keys, right here.</p>
        </div>
      </div>

      {available.length === 0 ? (
        <p className={`text-sm ${muted}`}>Connect a service above to try its API.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={label}>Endpoint</label>
            <select value={selected?.id} onChange={e => selectEndpoint(e.target.value)} className={input}>
              {available.map(e => (
                <option key={e.id} value={e.id}>{e.method} {e.path} — {e.label}</option>
              ))}
            </select>
          </div>

          {selected && (selected.params ?? []).length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {selected.params!.map(param => (
                <div key={param.name}>
                  <label className={label}>{param.name}{param.required ? ' *' : ' (optional)'}</label>
                  <input
                    value={paramValues[param.name] ?? ''}
                    onChange={e => setParamValues(v => ({ ...v, [param.name]: e.target.value }))}
                    placeholder={param.placeholder}
                    className={input}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className={label}>Bearer token</label>
            <input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="alr_live_..."
              className={input}
            />
            <p className={`text-xs mt-1 ${muted}`}>
              Paste a key from &quot;Agent access&quot; above. Only sent directly to this request — never stored.
            </p>
          </div>

          <button
            type="button"
            disabled={sending || !selected}
            onClick={send}
            className="px-4 py-2 rounded-md bg-brand-900 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send request'}
          </button>

          {error && (
            <div className={`p-2.5 rounded-md text-sm ${isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}

          {result && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  result.ok
                    ? isDarkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'
                    : isDarkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700'
                }`}>
                  {result.status}
                </span>
                <span className={`text-xs ${muted}`}>{result.durationMs}ms</span>
              </div>
              <pre className={`text-xs p-3 rounded-md overflow-x-auto max-h-80 overflow-y-auto ${
                isDarkMode ? 'bg-black/40 text-gray-200' : 'bg-white text-gray-800 border border-gray-200'
              }`}>{result.body}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
