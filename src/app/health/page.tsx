import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

export default async function HealthPage() {
  const user = await requireDomainAccess('health');
  // Without legacy domains this is a plain view; the agent chat lives at /agents/self/agent.
  if (!isLegacyDomainsEnabled()) return <DataPageView page="health" userId={String(user.id)} isAdmin={user.is_admin} />;
  const skill = await getDomainSkillDefault('health');
  return (
    <ChatClient
      domainSlug="health"
      domainName="Health"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showHealth
      isAdmin={user.is_admin}
    />
  );
}
