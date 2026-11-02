import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

export default async function MemoryPage() {
  const user = await requireDomainAccess('memory');
  // Without legacy domains this is a plain view; the agent chat lives at /agents/self/agent.
  if (!isLegacyDomainsEnabled()) return <DataPageView page="memory" userId={String(user.id)} isAdmin={user.is_admin} />;
  const skill = await getDomainSkillDefault('memory');
  return (
    <ChatClient
      domainSlug="memory"
      domainName="Knowledge"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showMemory
      isAdmin={user.is_admin}
    />
  );
}
