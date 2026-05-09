import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function CodePage() {
  const user = await requireDomainAccess('code');
  const skill = await getDomainSkillDefault('code');
  return <ChatClient defaultSkillName={skill?.skill_name} domainName="Code" showWorkspace defaultSidebarCollapsed chatMode="terminal" terminalTheme="code" isAdmin={user.is_admin} />;
}
