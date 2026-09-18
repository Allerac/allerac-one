import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function MusicPage() {
  const user = await requireDomainAccess('music');
  const skill = await getDomainSkillDefault('music');
  return (
    <ChatClient
      domainSlug="music"
      domainName="Music"
      defaultSkillName={skill?.skill_name}
      defaultSidebarCollapsed
      showMusic
      isAdmin={user.is_admin}
    />
  );
}
