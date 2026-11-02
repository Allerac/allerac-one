import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';
import DataPageView from '@/app/components/layout/DataPageView';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

export default async function EmailPage() {
  const user = await requireDomainAccess('email');
  // Without legacy domains this is a plain view; the agent chat lives at /agents/self/agent.
  if (!isLegacyDomainsEnabled()) return <DataPageView page="email" userId={String(user.id)} isAdmin={user.is_admin} />;
  const skill = await getDomainSkillDefault('email');
  return (
    <ChatClient
      domainSlug="email"
      domainName="Email"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showEmail
      isAdmin={user.is_admin}
    />
  );
}
