import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function JobsPage() {
  const user = await requireDomainAccess('jobs');
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
