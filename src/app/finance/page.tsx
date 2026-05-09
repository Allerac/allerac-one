import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function FinancePage() {
  const user = await requireDomainAccess('finance');
  const skill = await getDomainSkillDefault('finance');
  return <ChatClient defaultSkillName={skill?.skill_name} defaultSidebarCollapsed domainName="Finance" isAdmin={user.is_admin} />;
}
