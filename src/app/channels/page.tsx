import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

export default async function ChannelsPage() {
  const [user, skill] = await Promise.all([
    requireDomainAccess('channels'),
    getDomainSkillDefault('channels'),
  ]);

  if (!isLegacyDomainsEnabled()) return <DataPageView page="channels" userId={String(user.id)} isAdmin={user.is_admin} />;

  return (
    <ChatClient
      domainSlug="channels"
      domainName="Channels"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showChannels
      isAdmin={user.is_admin}
    />
  );
}
