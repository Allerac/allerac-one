import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import CodeClient from './CodeClient';

export default async function CodePage() {
  const user  = await requireDomainAccess('code');
  const skill = await getDomainSkillDefault('code');
  return (
    <CodeClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
