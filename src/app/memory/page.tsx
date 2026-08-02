import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import MemoryClient from './MemoryClient';

export default async function MemoryPage() {
  const user = await requireDomainAccess('memory');
  const skill = await getDomainSkillDefault('memory');
  return (
    <MemoryClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
