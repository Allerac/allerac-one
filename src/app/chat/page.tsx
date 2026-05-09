import { requireDomainAccess } from '@/app/lib/domain-access';
import ChatClient from './ChatClient';

export default async function ChatPage() {
  const user = await requireDomainAccess('chat');
  return <ChatClient defaultSidebarCollapsed isAdmin={user.is_admin} />;
}
