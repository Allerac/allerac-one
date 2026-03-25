import HubClient from './HubClient';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { redirect } from 'next/navigation';

const authService = new AuthService();

export default async function HubPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/');
  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/');

  return <HubClient userName={user.email.split('@')[0]} />;
}
