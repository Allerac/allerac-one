import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function MemoryPage() {
  const user = await requireDomainAccess('memory');
  const skill = await getDomainSkillDefault('memory');
  return (
    <ChatClient
      domainSlug="memory"
      domainName="Knowledge"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showMemory
      isAdmin={user.is_admin}
    />
  );
}
