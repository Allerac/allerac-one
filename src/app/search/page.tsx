import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import SearchClient from './SearchClient';

export default async function SearchPage() {
  const user  = await requireDomainAccess('search');
  const skill = await getDomainSkillDefault('search');
  return (
    <SearchClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
