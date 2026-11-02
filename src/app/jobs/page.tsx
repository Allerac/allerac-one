import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

export default async function JobsPage() {
  const user = await requireDomainAccess('jobs');
  // Without legacy domains this is a plain view; the agent chat lives at /agents/self/agent.
  if (!isLegacyDomainsEnabled()) return <DataPageView page="jobs" userId={String(user.id)} isAdmin={user.is_admin} />;
  const skill = await getDomainSkillDefault('jobs');
  return (
    <ChatClient
      domainSlug="jobs"
      domainName="Jobs"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showJobs
      isAdmin={user.is_admin}
    />
  );
}
