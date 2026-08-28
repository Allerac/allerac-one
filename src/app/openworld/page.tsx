import { requireDomainAccess } from '@/app/lib/domain-access';
import OpenWorldAgentClient from './OpenWorldAgentClient';

export default async function OpenWorldPage() {
  const user = await requireDomainAccess('openworld');

  return (
    <OpenWorldAgentClient userId={user.id} userName={user.name} userEmail={user.email} />
  );
}
