import HubClient from './hub/HubClient';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { redirect } from 'next/navigation';

const authService = new AuthService();

export default async function RootPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/login');
  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/login');

  return <HubClient userName={user.email.split('@')[0]} userEmail={user.email} userId={String(user.id)} />;
}
