import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import EmailClient from './EmailClient';

export default async function EmailPage() {
  const user = await requireDomainAccess('email');
  const skill = await getDomainSkillDefault('email');
  return (
    <EmailClient
      userId={user.id}
      userName={user.name ?? null}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
