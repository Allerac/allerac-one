import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function WritePage() {
  const user = await requireDomainAccess('write');
  const skill = await getDomainSkillDefault('write');
  return <ChatClient defaultSkillName={skill?.skill_name} defaultSidebarCollapsed domainName="Content" isAdmin={user.is_admin} />;
}
