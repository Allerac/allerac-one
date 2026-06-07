import HubClient from './hub/HubClient';
import { requireAdmin } from '@/app/lib/domain-access';
import { getUserAccessibleDomains } from '@/app/actions/domains';
import pool from '@/app/clients/db';

export default async function RootPage() {
  const user = await requireAdmin();

  let completedHubTour = false;
  let allowedDomains: string[] = [];
  try {
    const [tourRes, domains] = await Promise.all([
      pool.query('SELECT completed_onboarding_tour FROM users WHERE id = $1', [user.id]),
      getUserAccessibleDomains(String(user.id), true),
    ]);
    completedHubTour = tourRes.rows[0]?.completed_onboarding_tour ?? false;
    allowedDomains = domains;
  } catch (error) {
    console.error('[RootPage] Error fetching data:', error);
  }

  return (
    <HubClient
      userName={user.email.split('@')[0]}
      userEmail={user.email}
      userId={String(user.id)}
      completedHubTour={completedHubTour}
      allowedDomains={allowedDomains}
    />
  );
}
