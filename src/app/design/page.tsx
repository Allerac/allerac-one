import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import DomainLayout from '@/app/components/layout/DomainLayout';
import DesignCanvas from './DesignCanvas';

export default async function DesignPage() {
  const user  = await requireDomainAccess('design');
  const skill = await getDomainSkillDefault('design');
  return (
    <DomainLayout
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      domainId="design"
      defaultSkillName={skill?.skill_name}
    >
      <DesignCanvas />
    </DomainLayout>
  );
}
