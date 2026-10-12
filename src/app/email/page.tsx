import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function EmailPage() {
  const user = await requireDomainAccess('email');
  const skill = await getDomainSkillDefault('email');
  return (
    <ChatClient
      domainSlug="email"
      domainName="Email"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showEmail
      isAdmin={user.is_admin}
    />
  );
}
