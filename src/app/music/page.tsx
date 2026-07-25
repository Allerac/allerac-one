import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import MusicClient from './MusicClient';

export default async function MusicPage() {
  const user = await requireDomainAccess('music');
  const skill = await getDomainSkillDefault('music');
  return (
    <MusicClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
