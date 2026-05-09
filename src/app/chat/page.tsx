import { requireDomainAccess } from '@/app/lib/domain-access';
import ChatClient from './ChatClient';

export default async function ChatPage() {
  await requireDomainAccess('chat');
  return <ChatClient defaultSidebarCollapsed />;
}
