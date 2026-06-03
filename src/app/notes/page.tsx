import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import NotesClient from './NotesClient';

export default async function NotesPage() {
  const user  = await requireDomainAccess('notes');
  const skill = await getDomainSkillDefault('notes');
  return (
    <NotesClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      defaultSkillName={skill?.skill_name}
    />
  );
}
