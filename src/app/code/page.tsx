import { requireDomainAccess } from '@/app/lib/domain-access';
import ChatClient from '../chat/ChatClient';

export default async function CodePage() {
  await requireDomainAccess('code');
  return <ChatClient defaultSkillName="programmer" domainName="Code" showWorkspace defaultSidebarCollapsed chatMode="terminal" terminalTheme="code" />;
}
