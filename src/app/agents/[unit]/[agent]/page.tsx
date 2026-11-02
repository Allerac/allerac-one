import { notFound } from 'next/navigation';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { SELF_UNIT } from '@/app/components/inbox/agents-format';
import { resolveUnitProfile } from '@/federation/unit-profile';
import LocalAgentClient from '@/app/agents/_shell/LocalAgentClient';
import AgentChatClient from './AgentChatClient';

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ unit: string; agent: string }>;
  searchParams: Promise<{ thread?: string | string[] }>;
};

/**
 * `/agents/self/agent` is this Unit's own agent (the local chat, embedded),
 * for anyone with chat access. Any other unit is a remote agent: admins only;
 * everyone else gets a 404.
 */
export default async function AgentChatPage({ params, searchParams }: Props) {
  const { unit, agent } = await params;
  if (decodeURIComponent(unit).toLowerCase() === SELF_UNIT) {
    if (decodeURIComponent(agent).toLowerCase() !== 'agent') notFound();
    const user = await requireDomainAccess('chat');
    return <LocalAgentClient isAdmin={user.is_admin} localName={resolveUnitProfile(null).displayName} />;
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
  return <AgentChatClient key={`${unitName}/${agentSlug}`} unitName={unitName} agentSlug={agentSlug} threadId={threadId} />;
}
