import { requireAdmin } from '@/app/lib/domain-access';
import { listUsers, listActiveDomains } from '@/app/actions/admin';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  await requireAdmin();
  const [users, domains] = await Promise.all([listUsers(), listActiveDomains()]);
  return <AdminClient initialUsers={users} initialDomains={domains} />;
}
