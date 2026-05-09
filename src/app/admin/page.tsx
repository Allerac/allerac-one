import { requireAdmin } from '@/app/lib/domain-access';
import {
  listUsers, listActiveDomains, listAllDomains,
  getSystemSettings, listInstagramAccounts, listInstagramConnectedAdmins,
} from '@/app/actions/admin';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  await requireAdmin();
  const [users, activeDomains, allDomains, systemSettings, instagramAccounts, connectedAdmins] = await Promise.all([
    listUsers(),
    listActiveDomains(),
    listAllDomains(),
    getSystemSettings(),
    listInstagramAccounts(),
    listInstagramConnectedAdmins(),
  ]);
  return (
    <AdminClient
      initialUsers={users}
      initialDomains={activeDomains}
      initialAllDomains={allDomains}
      initialSystemSettings={systemSettings}
      initialInstagramAccounts={instagramAccounts}
      initialConnectedAdmins={connectedAdmins}
    />
  );
}
