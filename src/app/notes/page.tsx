import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function NotesPage() {
  const user = await requireDomainAccess('notes');
  const skill = await getDomainSkillDefault('notes');
  return (
    <ChatClient
      domainSlug="notes"
      domainName="Notes"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showNotes
      isAdmin={user.is_admin}
    />
  );
}
