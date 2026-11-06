import HubClient from './HubClient';
import { requireAdmin } from '@/app/lib/domain-access';
import { getUserAccessibleDomains } from '@/app/actions/domains';
import pool from '@/app/clients/db';
import { isGrampeadorEnabled } from '@/app/actions/clippy';
import { isLegacyDomainsEnabled } from '@/lib/legacy-domains';

/** The domain tile hub (former home page), admins only. */
export default async function HubPage() {
  const user = await requireAdmin();

  let completedHubTour = false;
  let allowedDomains: string[] = [];
  try {
    const [tourRes, domains] = await Promise.all([
      pool.query('SELECT completed_onboarding_tour FROM users WHERE id = $1', [user.id]),
      getUserAccessibleDomains(),
    ]);
    completedHubTour = tourRes.rows[0]?.completed_onboarding_tour ?? false;
    allowedDomains = domains;
  } catch (error) {
    console.error('[HubPage] Error fetching data:', error);
  }

  return (
    <HubClient
      userName={user.email.split('@')[0]}
      userEmail={user.email}
      userId={String(user.id)}
      completedHubTour={completedHubTour}
      allowedDomains={allowedDomains}
      grampeadorBubblesEnabled={await isGrampeadorEnabled()}
      legacyDomains={isLegacyDomainsEnabled()}
    />
  );
}
