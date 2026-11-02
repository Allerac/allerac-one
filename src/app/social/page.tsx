import { redirect } from 'next/navigation';
import { AGENT_HOME_PATH, isLegacyDomainsEnabled } from '@/lib/legacy-domains';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function SocialPage() {
  const user = await requireDomainAccess('social');
  // Per-domain chats are hidden without legacy domains; old conversations stay in the DB.
  if (!isLegacyDomainsEnabled()) redirect(AGENT_HOME_PATH);
  const skill = await getDomainSkillDefault('social');
  return <ChatClient domainSlug="social" defaultSkillName={skill?.skill_name} defaultSidebarCollapsed domainName="Social" showInstagramDM showInstagramPost isAdmin={user.is_admin} />;
}
