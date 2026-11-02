import { redirect } from 'next/navigation';
import { AGENT_HOME_PATH, isLegacyDomainsEnabled } from '@/lib/legacy-domains';
import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import SearchClient from './SearchClient';

export default async function SearchPage() {
  const user  = await requireDomainAccess('search');
  // Per-domain chats are hidden without legacy domains; old conversations stay in the DB.
  if (!isLegacyDomainsEnabled()) redirect(AGENT_HOME_PATH);
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
