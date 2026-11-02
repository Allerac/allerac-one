import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

export default async function MusicPage() {
  const user = await requireDomainAccess('music');
  // Without legacy domains this is a plain view; the agent chat lives at /agents/self/agent.
  if (!isLegacyDomainsEnabled()) return <DataPageView page="music" userId={String(user.id)} isAdmin={user.is_admin} />;
  const skill = await getDomainSkillDefault('music');
  return (
    <ChatClient
      domainSlug="music"
      domainName="Music"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showMusic
      isAdmin={user.is_admin}
    />
  );
}
