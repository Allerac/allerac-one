import HubClient from './hub/HubClient';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { redirect } from 'next/navigation';
import pool from '@/app/clients/db';

const authService = new AuthService();

export default async function RootPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/login');
  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/login');

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
