import { getDomainSkillDefault } from '@/app/actions/skills';
import { requireDomainAccess } from '@/app/lib/domain-access';
import RobotClient from './RobotClient';

export default async function RobotAssistantPage() {
  const user = await requireDomainAccess('robot-assistant');
  const skill = await getDomainSkillDefault('robot-assistant');

  return (
    <RobotClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      defaultSkillName={skill?.skill_name}
      isAdmin={user.is_admin}
    />
  );
}
