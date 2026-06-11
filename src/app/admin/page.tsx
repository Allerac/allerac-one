import { requireAdmin } from '@/app/lib/domain-access';
import {
  listUsers, listActiveDomains, listAllDomains,
  getSystemSettings, listInstagramAccounts, listInstagramConnectedAdmins,
  listTikTokAccounts, listTikTokConnectedAdmins,
  listCreditPlans, listOperationPricing,
} from '@/app/actions/admin';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  await requireAdmin();
  const [
    users,
    activeDomains,
    allDomains,
    systemSettings,
    instagramAccounts,
    connectedAdmins,
    tiktokAccounts,
    tiktokConnectedAdmins,
    creditPlans,
    operationPricing,
  ] = await Promise.all([
    listUsers(),
    listActiveDomains(),
    listAllDomains(),
    getSystemSettings(),
    listInstagramAccounts(),
    listInstagramConnectedAdmins(),
    listTikTokAccounts(),
    listTikTokConnectedAdmins(),
    listCreditPlans(),
    listOperationPricing(),
  ]);
  return (
    <AdminClient
      initialUsers={users}
      initialDomains={activeDomains}
      initialAllDomains={allDomains}
      initialSystemSettings={systemSettings}
      initialInstagramAccounts={instagramAccounts}
      initialConnectedAdmins={connectedAdmins}
      initialTikTokAccounts={tiktokAccounts}
      initialTikTokConnectedAdmins={tiktokConnectedAdmins}
      initialCreditPlans={creditPlans}
      initialOperationPricing={operationPricing}
    />
  );
}
