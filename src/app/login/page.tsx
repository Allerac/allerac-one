import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import LoginClient from './LoginClient';

const authService = new AuthService();

export default async function LoginPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (sessionToken) {
    const user = await authService.validateSession(sessionToken);
    if (user) redirect('/');
  }

  return <LoginClient />;
}
