import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

export default async function NotesPage() {
  const user = await requireDomainAccess('notes');
  // Without legacy domains this is a plain view; the agent chat lives at /agents/self/agent.
  if (!isLegacyDomainsEnabled()) return <DataPageView page="notes" userId={String(user.id)} isAdmin={user.is_admin} />;
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
