import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';

export default async function SocialPage() {
  const user = await requireDomainAccess('social');
  // Without legacy domains: studio and DMs as a plain page, no domain chat.
  if (!isLegacyDomainsEnabled()) return <DataPageView page="social" userId={String(user.id)} isAdmin={user.is_admin} />;
  const skill = await getDomainSkillDefault('social');
  return <ChatClient domainSlug="social" defaultSkillName={skill?.skill_name} defaultSidebarCollapsed domainName="Social" showInstagramDM showInstagramPost isAdmin={user.is_admin} />;
}
