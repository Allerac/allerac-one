import HubClient from './hub/HubClient';
import { requireAdmin } from '@/app/lib/domain-access';
import pool from '@/app/clients/db';

export default async function RootPage() {
  const user = await requireAdmin();

  // Fetch hub tour completion status
  let completedHubTour = false;
  try {
    const userRes = await pool.query(
      'SELECT completed_onboarding_tour FROM users WHERE id = $1',
      [user.id]
    );
    completedHubTour = userRes.rows[0]?.completed_onboarding_tour ?? false;
  } catch (error) {
    console.error('[RootPage] Error fetching hub tour status:', error);
    completedHubTour = false;
  }

  return (
    <HubClient
      userName={user.email.split('@')[0]}
      userEmail={user.email}
      userId={String(user.id)}
      completedHubTour={completedHubTour}
    />
  );
}
