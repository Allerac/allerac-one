import { redirect } from 'next/navigation';
import { requireDomainAccess } from '@/app/lib/domain-access';
import ChatClient from './ChatClient';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { searchParams?: Promise<{ inboxThread?: string | string[] }> };

/** Old inbox deep links (`/chat?inboxThread=<id>`) now open the agent chat view. */
async function legacyInboxTarget(userId: string, threadId: string): Promise<string | null> {
  const [{ inboxRepository }, { peerRepository }, { agentHref }] = await Promise.all([
    import('@/federation/inbox.repository'),
    import('@/federation/peer.repository'),
    import('@/app/components/inbox/agents-format'),
  ]);
  const thread = await inboxRepository.getThread(userId, threadId);
  if (!thread) return null;
  const peer = await peerRepository.get(thread.peerId);
  return peer ? agentHref(peer.unitName, thread.agentSlug, thread.id) : null;
}

export default async function ChatPage({ searchParams }: Props) {
  const user = await requireDomainAccess('chat');
  const legacy = (await searchParams)?.inboxThread;
  if (user.is_admin && typeof legacy === 'string' && UUID.test(legacy)) {
    const target = await legacyInboxTarget(user.id, legacy).catch(() => null);
    if (target) redirect(target);
  }
  return <ChatClient domainSlug="chat" defaultSidebarCollapsed isAdmin={user.is_admin} />;
}
