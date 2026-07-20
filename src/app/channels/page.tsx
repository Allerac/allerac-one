import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChannelsClient from './ChannelsClient';

export default async function ChannelsPage() {
  const [user, skill] = await Promise.all([
    requireDomainAccess('channels'),
    getDomainSkillDefault('channels'),
  ]);

  return (
    <ChannelsClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
