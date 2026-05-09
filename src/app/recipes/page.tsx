import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function RecipesPage() {
  const user = await requireDomainAccess('recipes');
  const skill = await getDomainSkillDefault('recipes');
  return <ChatClient defaultSkillName={skill?.skill_name} defaultSidebarCollapsed domainName="Recipes" isAdmin={user.is_admin} />;
}
