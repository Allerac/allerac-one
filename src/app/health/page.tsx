import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function HealthPage() {
  const user = await requireDomainAccess('health');
  const skill = await getDomainSkillDefault('health');
  return <ChatClient defaultSkillName={skill?.skill_name} domainName="Health" showHealth defaultSidebarCollapsed isAdmin={user.is_admin} />;
}
