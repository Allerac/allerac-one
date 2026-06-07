import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import TicketsClient from './TicketsClient';

const authService = new AuthService();

export default async function TicketsPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/login');

  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/login');

  return (
    <TicketsClient
      userId={user.id}
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.is_admin}
    />
  );
}
