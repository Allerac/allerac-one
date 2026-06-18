import { requireDomainAccess } from '@/app/lib/domain-access';
import { getUserAccessibleDomains } from '@/app/actions/domains';
import LearnClient from './LearnClient';

export default async function LearnPage() {
  const [user, domains] = await Promise.all([
    requireDomainAccess('learn'),
    getUserAccessibleDomains(),
  ]);

  return (
    <LearnClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
      allowedDomains={domains}
    />
  );
}
