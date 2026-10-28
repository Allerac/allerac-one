import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function MedicalPage() {
  const user = await requireDomainAccess('medical');
  const skill = await getDomainSkillDefault('medical');
  return (
    <ChatClient
      domainSlug="medical"
      domainName="Medical"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      isAdmin={user.is_admin}
    />
  );
}
