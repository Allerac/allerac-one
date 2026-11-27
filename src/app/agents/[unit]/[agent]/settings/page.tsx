import { notFound } from 'next/navigation';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { SELF_UNIT } from '@/app/components/inbox/agents-format';
import { botsEnabled } from '@/app/services/agent/bot-runtime';
import { getUnitAgent } from '@/app/services/agent/unit-agents.repository';
import { AGENT_SLUG_PATTERN } from '@/app/services/agent/unit-agents';
import BotForm from '@/app/components/bots/BotForm';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ unit: string; agent: string }> };

/**
 * `/agents/self/<slug>/settings`: edit or archive a bot (multi-bot PR 4).
 * Admins only, ALLERAC_BOTS=true. The default agent is edited in the Hub.
 */
export default async function BotSettingsPage({ params }: Props) {
  const { unit, agent } = await params;
  const slug = decodeURIComponent(agent).toLowerCase();
  if (decodeURIComponent(unit).toLowerCase() !== SELF_UNIT || !botsEnabled() || !AGENT_SLUG_PATTERN.test(slug)) notFound();
  try {
    await requireCurrentAdmin();
  } catch {
    notFound();
  }
  const bot = await getUnitAgent(slug);
  if (!bot || bot.isDefault) notFound();
  return <BotForm initial={bot} />;
}
