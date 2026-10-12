import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function HealthPage() {
  const user = await requireDomainAccess('health');
  const skill = await getDomainSkillDefault('health');
  return (
    <ChatClient
      domainSlug="health"
      domainName="Health"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showHealth
      isAdmin={user.is_admin}
    />
  );
}
