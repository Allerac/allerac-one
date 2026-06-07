import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import JobsClient from './JobsClient';

export default async function JobsPage() {
  const user  = await requireDomainAccess('jobs');
  const skill = await getDomainSkillDefault('jobs');
  return (
    <JobsClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
