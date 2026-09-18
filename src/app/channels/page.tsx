import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function ChannelsPage() {
  const [user, skill] = await Promise.all([
    requireDomainAccess('channels'),
    getDomainSkillDefault('channels'),
  ]);

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
