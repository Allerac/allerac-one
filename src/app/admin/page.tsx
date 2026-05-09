import { requireAdmin } from '@/app/lib/domain-access';
import { listUsers, listActiveDomains, listAllDomains } from '@/app/actions/admin';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  await requireAdmin();
  const [users, activeDomains, allDomains] = await Promise.all([
    listUsers(),
    listActiveDomains(),
    listAllDomains(),
  ]);
  return <AdminClient initialUsers={users} initialDomains={activeDomains} initialAllDomains={allDomains} />;
}
