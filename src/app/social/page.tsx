import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function SocialPage() {
  const user = await requireDomainAccess('social');
  const skill = await getDomainSkillDefault('social');
  return <ChatClient defaultSkillName={skill?.skill_name} defaultSidebarCollapsed domainName="Social" showInstagramDM showInstagramPost isAdmin={user.is_admin} />;
}
