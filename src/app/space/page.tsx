import { requireDomainAccess } from '@/app/lib/domain-access';
import { getUserAccessibleDomains } from '@/app/actions/domains';
import SpaceClient from './SpaceClient';

export default async function SpacePage() {
  const [user, domains] = await Promise.all([
    requireDomainAccess('space'),
    getUserAccessibleDomains(),
  ]);
  return (
    <SpaceClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      allowedDomains={domains}
    />
  );
}
