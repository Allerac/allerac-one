'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import * as authActions from '@/app/actions/auth';
import GarminSettings from '@/app/components/settings/GarminSettings';
import AgentAccessPanel from '@/app/components/settings/AgentAccessPanel';
import QuickTokenCard, { createQuickToken } from '@/app/components/settings/QuickTokenCard';
import ApiConsole, { type ApiConsoleEndpoint } from '@/app/components/settings/ApiConsole';
import { buildAgentPrompt } from './agent-prompt';

const SCOPE_OPTIONS = [{ scope: 'health:proxy:read', label: 'Garmin (live reads)', provider: 'garmin' }];

const API_ENDPOINTS: ApiConsoleEndpoint[] = [
  { id: 'garmin-status', provider: 'garmin', method: 'GET', path: '/api/v1/health/proxy/status', label: 'Connection status' },
  {
    id: 'garmin-activities',
    provider: 'garmin',
    method: 'GET',
    path: '/api/v1/health/proxy/activities',
    label: 'Activities for a day',
    params: [
      { name: 'date', required: true, placeholder: 'YYYY-MM-DD' },
      { name: 'limit', required: false, placeholder: '20' },
    ],
  },
  {
    id: 'garmin-daily',
    provider: 'garmin',
    method: 'GET',
    path: '/api/v1/health/proxy/daily',
    label: 'Daily health metrics',
    params: [{ name: 'date', required: true, placeholder: 'YYYY-MM-DD' }],
  },
];

interface BridgeClientProps {
  userId: string;
  userName: string | null;
  userEmail: string;
}

export default function BridgeClient({ userId, userName, userEmail }: BridgeClientProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const [garminConnected, setGarminConnected] = useState(false);
  const [baseUrl] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''));
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptGenerating, setPromptGenerating] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [keysRefreshCount, setKeysRefreshCount] = useState(0);

  const handleGarminStatusChange = useCallback((isConnected: boolean) => {
    setGarminConnected(isConnected);
  }, []);

  const handleLogout = async () => {
    await authActions.logout();
    router.push('/login');
  };

  const connectedProviders = garminConnected ? ['garmin'] : [];
  const connectedEndpoints = API_ENDPOINTS.filter(e => connectedProviders.includes(e.provider));
  const connectedScopes = SCOPE_OPTIONS.filter(o => connectedProviders.includes(o.provider)).map(o => o.scope);

  const copyAgentPrompt = async () => {
    if (connectedScopes.length === 0) return;
    setPromptGenerating(true);
    setPromptError(null);
    try {
      const token = await createQuickToken(connectedScopes);
      const prompt = buildAgentPrompt(connectedEndpoints, baseUrl, { value: token.secret, expiresAt: token.expiresAt });
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setKeysRefreshCount(c => c + 1);
      setTimeout(() => setPromptCopied(false), 3000);
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : 'Failed to generate the prompt.');
    } finally {
      setPromptGenerating(false);
    }
  };

  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <div className={`sticky top-0 z-10 border-b ${isDark ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className={`text-lg font-semibold ${text}`}>Bridge</h1>
            <p className={`text-xs ${muted}`}>{userName ? `${userName} · ` : ''}{userEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            className={`text-sm px-3 py-1.5 rounded-md ${isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Log out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <p className={`text-sm ${muted}`}>
          This connects your own agents to your services without sharing your credentials
          with them. Connect a service below, then hit &quot;Copy agent prompt&quot; and paste
          it into any AI chat — that&apos;s it.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <div>
              <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>Garmin</h2>
              <GarminSettings userId={userId} isDarkMode={isDark} onStatusChange={handleGarminStatusChange} />
            </div>

            <div>
              <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>Quick token</h2>
              <QuickTokenCard
                key={keysRefreshCount}
                isDarkMode={isDark}
                scopeOptions={SCOPE_OPTIONS}
                connectedProviders={connectedProviders}
                onCreated={() => setKeysRefreshCount(c => c + 1)}
              />
            </div>

            <div>
              <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>Connect an agent</h2>
              <div className={`p-4 rounded-lg border-2 ${isDark ? 'border-brand-500/40 bg-brand-500/5' : 'border-brand-300 bg-brand-50'}`}>
                <p className={`text-xs mb-3 ${muted}`}>
                  One click: copies a working token (expires in 6h) plus instructions for calling
                  these APIs. Paste the whole thing into any AI chat and it can start reading your
                  data right away — nothing else to set up.
                </p>

                {promptError && (
                  <div className={`mb-2 p-2 rounded-md text-sm ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
                    {promptError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={connectedEndpoints.length === 0 || promptGenerating}
                  onClick={copyAgentPrompt}
                  className="px-4 py-2 rounded-md bg-brand-900 text-white text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                >
                  {promptGenerating ? 'Generating…' : promptCopied ? '✓ Copied — paste it now' : 'Copy agent prompt'}
                </button>

                {connectedEndpoints.length === 0 && (
                  <p className={`text-sm mt-2 ${muted}`}>Connect a service above first.</p>
                )}

                <details className="mt-3 group">
                  <summary className={`text-xs font-medium cursor-pointer ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Setting up a permanent agent instead? Read this first
                  </summary>
                  <div className={`text-xs mt-2 space-y-1.5 ${muted}`}>
                    <p className={`px-2.5 py-2 rounded-md ${isDark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'}`}>
                      ⚠️ Never paste a permanent key from &quot;Access Keys&quot; into a chat with any
                      AI — unlike the quick token above, it doesn&apos;t expire on its own.
                    </p>
                    <ol className="ml-4 space-y-1.5 list-decimal">
                      <li>Save the key as an environment variable (e.g. <code>ALLERAC_API_KEY</code>) or in a secrets manager — never in a prompt or chat message.</li>
                      <li>If your AI tool supports function calling, tools, Actions, or MCP: wire the key there. The model only ever calls the tool by name — the tool&apos;s own code attaches the key, not the model.</li>
                      <li>If it has no tool support at all: run the request yourself and paste only the response back — the key never has to touch the conversation.</li>
                    </ol>
                  </div>
                </details>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>Access Keys</h2>
              <AgentAccessPanel
                key={keysRefreshCount}
                isDarkMode={isDark}
                scopeOptions={SCOPE_OPTIONS}
                connectedProviders={connectedProviders}
                title="Access Keys"
                description="Generate your API key to consume the Allerac APIs."
              />
            </div>

            <div>
              <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>API</h2>
              <ApiConsole
                isDarkMode={isDark}
                endpoints={API_ENDPOINTS}
                connectedProviders={connectedProviders}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
