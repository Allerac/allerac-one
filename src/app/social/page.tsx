import { requireDomainAccess } from '@/app/lib/domain-access';
import ChatClient from '../chat/ChatClient';

export default async function SocialPage() {
  await requireDomainAccess('social');
  return <ChatClient defaultSkillName="social" defaultSidebarCollapsed domainName="Social" terminalTheme="social" systemDashboardInitialTab="social" showInstagramDM showInstagramPost />;
}
