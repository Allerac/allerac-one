import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import FinanceClient from './FinanceClient';

export default async function FinancePage() {
  const user = await requireDomainAccess('finance');
  const skill = await getDomainSkillDefault('finance');
  return (
    <FinanceClient
      userId={user.id}
      userName={user.name ?? null}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
