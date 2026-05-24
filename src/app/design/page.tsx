import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import DesignClient from './DesignClient';

export default async function DesignPage() {
  const user  = await requireDomainAccess('design');
  const skill = await getDomainSkillDefault('design');
  return (
    <DesignClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
