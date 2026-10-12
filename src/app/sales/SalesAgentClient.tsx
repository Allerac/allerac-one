'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import * as authActions from '@/app/actions/auth';
import AgentAccessPanel from '@/app/components/settings/AgentAccessPanel';
import { ModelPicker, RateLimitPanel, TestChatPanel } from '@/app/components/domains/ExternalAgentSettingsPanel';

// This domain is UI-less by design: the sales-bot account it belongs to has
// no access to any other domain, so it can't reach a normal Settings page.
// This screen exists only so that account can self-issue and rotate its own
// chat:write key for the allerac.ai website widget — same pattern as /bridge —
// plus pick which model answers on its behalf and configure its rate limit.
const SCOPE_OPTIONS = [{ scope: 'chat:write', label: 'Sales chat widget', provider: 'sales' }];

interface SalesAgentClientProps {
  userId: string;
  userName: string | null;
  userEmail: string;
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

        <ModelPicker domainSlug="sales" description="Which model answers in the sales chat widget." isDark={isDark} />

        <RateLimitPanel domainSlug="sales" isDark={isDark} />

        <TestChatPanel domainSlug="sales" isDark={isDark} />

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
