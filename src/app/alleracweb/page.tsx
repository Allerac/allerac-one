import { requireDomainAccess } from '@/app/lib/domain-access';
import AlleracWebAgentClient from './AlleracWebAgentClient';

export default async function AlleracWebPage() {
  const user = await requireDomainAccess('alleracweb');

  return (
    <AlleracWebAgentClient userId={user.id} userName={user.name} userEmail={user.email} />
  );
}
