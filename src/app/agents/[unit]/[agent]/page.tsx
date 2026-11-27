import { notFound } from 'next/navigation';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { SELF_UNIT } from '@/app/components/inbox/agents-format';
import { resolveUnitProfile } from '@/federation/unit-profile';
import LocalAgentClient from '@/app/agents/_shell/LocalAgentClient';
import AgentChatClient from './AgentChatClient';
import { loadAgentToolSettings } from '@/app/services/agent/agent-tool-settings.repository';
import { agentDataPages } from '@/app/services/agent/agent-pages';
import { EMPTY_AGENT_TOOL_SETTINGS } from '@/app/services/agent/agent-tool-settings';
import { AuthService } from '@/app/services/auth/auth.service';
import { botsEnabled, explicitBotToolSettings, isRunnableBot } from '@/app/services/agent/bot-runtime';
import { getUnitAgent } from '@/app/services/agent/unit-agents.repository';
import { AGENT_SLUG_PATTERN } from '@/app/services/agent/unit-agents';
import BotForm from '@/app/components/bots/BotForm';

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ unit: string; agent: string }>;
  searchParams: Promise<{ thread?: string | string[] }>;
};

/** Data pages of the local agent (enabled modules and tools) the user can open, for the 'Pages' menu. */
async function localDataPages(userId: string, isAdmin: boolean) {
  const auth = new AuthService();
  const settings = await loadAgentToolSettings().catch(() => EMPTY_AGENT_TOOL_SETTINGS);
  const pages = [];
  for (const p of agentDataPages(settings)) {
    const ok = await auth.canAccessDomain(userId, isAdmin, p.id).catch(() => false);
    if (ok) pages.push({ path: p.path, label: p.label, icon: p.icon });
  }
  return pages;
}

/**
 * `/agents/self/<slug>` for anything but `agent` (multi-bot PR 4, admins only,
 * ALLERAC_BOTS=true): `new` is the creation form, any other slug a bot chat.
 * Everyone else, unknown slugs and archived or disabled bots get a 404.
 */
async function localBotPage(slug: string) {
  if (!botsEnabled() || !AGENT_SLUG_PATTERN.test(slug)) notFound();
  try {
    await requireCurrentAdmin();
  } catch {
    notFound();
  }
  if (slug === 'new') return <BotForm />;
  const bot = await getUnitAgent(slug);
  if (!isRunnableBot(bot)) notFound();
  const pages = agentDataPages(explicitBotToolSettings(bot.toolSettings))
    .map((p) => ({ path: p.path, label: p.label, icon: p.icon }));
  return (
    <LocalAgentClient isAdmin localName={resolveUnitProfile(null).displayName} pages={pages} botsEnabled
      bot={{ slug: bot.slug, displayName: bot.displayName, emoji: bot.emoji, role: bot.role }} />
  );
}

/**
 * `/agents/self/agent` is this Unit's own agent (the local chat, embedded),
 * for anyone with chat access. Any other unit is a remote agent: admins only;
 * everyone else gets a 404.
 */
export default async function AgentChatPage({ params, searchParams }: Props) {
  const { unit, agent } = await params;
  if (decodeURIComponent(unit).toLowerCase() === SELF_UNIT) {
    const localSlug = decodeURIComponent(agent).toLowerCase();
    if (localSlug !== 'agent') return localBotPage(localSlug);
    const user = await requireDomainAccess('chat');
    const pages = await localDataPages(user.id, user.is_admin);
    return (
      <LocalAgentClient isAdmin={user.is_admin} localName={resolveUnitProfile(null).displayName} pages={pages}
        botsEnabled={user.is_admin && botsEnabled()} />
    );
  }
  try {
    await requireCurrentAdmin();
  } catch {
    notFound();
  }
  const unitName = decodeURIComponent(unit).toLowerCase();
  const agentSlug = decodeURIComponent(agent).toLowerCase();
  if (!SLUG.test(unitName) || !SLUG.test(agentSlug)) notFound();
  const { thread } = await searchParams;
  const threadId = typeof thread === 'string' && UUID.test(thread) ? thread : null;
  return <AgentChatClient key={`${unitName}/${agentSlug}`} unitName={unitName} agentSlug={agentSlug} threadId={threadId} botsEnabled={botsEnabled()} />;
}
