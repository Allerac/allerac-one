'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import * as authActions from '@/app/actions/auth';
import AgentAccessPanel from '@/app/components/settings/AgentAccessPanel';
import { ModelPicker, RateLimitPanel, TestChatPanel, TavilyKeyPanel } from '@/app/components/domains/ExternalAgentSettingsPanel';

// This domain is UI-less by design: the openworld-bot account it belongs to
// has no access to any other domain, so it can't reach a normal Settings
// page. This screen exists only so that account can self-issue and rotate
// its own chat:write key for the openworld.com.br website's FAQ chat, plus
// pick which model answers on its behalf and configure its rate limit. Same
// pattern as /sales — see docs/domains/expose-agent-to-website.md.
const SCOPE_OPTIONS = [{ scope: 'chat:write', label: 'OpenWorld FAQ chat', provider: 'openworld' }];

interface OpenWorldAgentClientProps {
  userId: string;
  userName: string | null;
  userEmail: string;
}

export default function OpenWorldAgentClient({ userName, userEmail }: OpenWorldAgentClientProps) {
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
            <h1 className={`text-lg font-semibold ${text}`}>OpenWorld</h1>
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
          This key powers the FAQ chat on www.openworld.com.br. Generate it here and set it as the
          <code> ALLERAC_ONE_API_KEY </code> app setting on the site&apos;s Azure Static Web App
          (Function <code>/api/chat</code>).
        </p>

        <ModelPicker domainSlug="openworld" description="Which model answers in the OpenWorld FAQ chat." isDark={isDark} />

        <TavilyKeyPanel domainSlug="openworld" isDark={isDark} />

        <RateLimitPanel domainSlug="openworld" isDark={isDark} />

        <TestChatPanel domainSlug="openworld" isDark={isDark} />

        <AgentAccessPanel
          isDarkMode={isDark}
          scopeOptions={SCOPE_OPTIONS}
          connectedProviders={['openworld']}
          title="Access Keys"
          description="Generate the chat:write key for the OpenWorld FAQ chat."
        />
      </div>
    </div>
  );
}
