import { requireDomainAccess } from '@/app/lib/domain-access';
import ChatClient from '../chat/ChatClient';

export default async function HealthPage() {
  await requireDomainAccess('health');
  return <ChatClient defaultSkillName="health" domainName="Health" showHealth defaultSidebarCollapsed terminalTheme="health" />;
}
