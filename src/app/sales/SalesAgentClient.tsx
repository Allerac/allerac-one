'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import * as authActions from '@/app/actions/auth';
import * as domainActions from '@/app/actions/domains';
import AgentAccessPanel from '@/app/components/settings/AgentAccessPanel';
import { MODELS } from '@/app/services/llm/models';
import type { DomainModelSettings } from '@/app/services/domains/domain-model-settings.service';

// This domain is UI-less by design: the sales-bot account it belongs to has
// no access to any other domain, so it can't reach a normal Settings page.
// This screen exists only so that account can self-issue and rotate its own
// chat:write key for the allerac.ai website widget — same pattern as /bridge —
// plus pick which model answers on its behalf.
const SCOPE_OPTIONS = [{ scope: 'chat:write', label: 'Sales chat widget', provider: 'sales' }];

interface SalesAgentClientProps {
  userId: string;
  userName: string | null;
  userEmail: string;
}

function ModelPicker({ isDark }: { isDark: boolean }) {
  const [settings, setSettings] = useState<DomainModelSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void domainActions.getDomainModelSettings('sales').then(setSettings);
  }, []);

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const text = isDark ? 'text-gray-200' : 'text-gray-800';
  const select = `w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
    isDark ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;

  const changeModel = async (modelId: string) => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    const next: DomainModelSettings = { ...settings, inheritGlobal: false, modelId };
    try {
      await domainActions.saveDomainModelSettings(next);
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🤖</span>
        <div>
          <h3 className={`text-sm font-semibold ${text}`}>Model</h3>
          <p className={`text-xs ${muted}`}>Which model answers in the sales chat widget.</p>
        </div>
      </div>

      {error && (
        <div className={`mb-3 p-2.5 rounded-md text-sm ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
          {error}
        </div>
      )}

      {!settings ? (
        <p className={`text-sm ${muted}`}>Loading…</p>
      ) : (
        <select
          value={settings.modelId ?? ''}
          disabled={saving}
          onChange={e => void changeModel(e.target.value)}
          className={select}
        >
          {!settings.modelId && <option value="">— Select a model —</option>}
          {MODELS.map(model => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export default function SalesAgentClient({ userName, userEmail }: SalesAgentClientProps) {
  const router = useRouter();
  const { isDark } = useTheme();

  const handleLogout = async () => {
    await authActions.logout();
    router.push('/login');
  };

  const text = isDark ? 'text-gray-100' : 'text-gray-900';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`h-full overflow-y-auto ${isDark ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <div className={`sticky top-0 z-10 border-b ${isDark ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-200'}`}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className={`text-lg font-semibold ${text}`}>Sales</h1>
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

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <p className={`text-sm ${muted}`}>
          This key powers the &quot;Talk to Allerac&quot; chat widget on allerac.ai. Generate it here
          and set it as the <code>SALES_BOT_API_KEY</code> secret on the website&apos;s Cloudflare Worker.
        </p>

        <ModelPicker isDark={isDark} />

        <AgentAccessPanel
          isDarkMode={isDark}
          scopeOptions={SCOPE_OPTIONS}
          connectedProviders={['sales']}
          title="Access Keys"
          description="Generate the chat:write key for the sales widget."
        />
      </div>
    </div>
  );
}
