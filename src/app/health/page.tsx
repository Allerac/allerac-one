import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import HealthClient from './HealthClient';

export default async function HealthPage() {
  const user  = await requireDomainAccess('health');
  const skill = await getDomainSkillDefault('health');
  return (
    <HealthClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
