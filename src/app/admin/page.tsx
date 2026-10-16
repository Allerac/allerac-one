import { requireAdmin } from '@/app/lib/domain-access';
import {
  listUsers, listActiveDomains, listAllDomains,
  getSystemSettings, listInstagramAccounts, listInstagramConnectedAdmins,
  listTikTokAccounts, listTikTokConnectedAdmins,
  listCreditPlans, listOperationPricing,
} from '@/app/actions/admin';
import AdminClient from './AdminClient';
import { getEnabledAdminIntegrations } from './integrations';
import { isModuleEnabled } from '@/modules/registry';

export default async function AdminPage() {
  await requireAdmin();
  // The Instagram/TikTok actions return [] when the social module is off.
  const integrations = getEnabledAdminIntegrations((id) => isModuleEnabled(id));
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
      integrations={integrations}
    />
  );
}
