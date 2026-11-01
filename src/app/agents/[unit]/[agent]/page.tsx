import { notFound } from 'next/navigation';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import AgentChatClient from './AgentChatClient';

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ unit: string; agent: string }>;
  searchParams: Promise<{ thread?: string | string[] }>;
};

/** Chat with a remote agent (Agents redesign): admins only; everyone else gets a 404. */
export default async function AgentChatPage({ params, searchParams }: Props) {
  try {
    await requireCurrentAdmin();
  } catch {
    notFound();
  }
  const { unit, agent } = await params;
  const unitName = decodeURIComponent(unit).toLowerCase();
  const agentSlug = decodeURIComponent(agent).toLowerCase();
  if (!SLUG.test(unitName) || !SLUG.test(agentSlug)) notFound();
  const { thread } = await searchParams;
  const threadId = typeof thread === 'string' && UUID.test(thread) ? thread : null;
  return <AgentChatClient key={`${unitName}/${agentSlug}`} unitName={unitName} agentSlug={agentSlug} threadId={threadId} />;
}
