import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import ChatClient from '../chat/ChatClient';

const authService = new AuthService();

export default async function WritePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) redirect('/login');
  const user = await authService.validateSession(token);
  if (!user) redirect('/login');

  return <ChatClient defaultSkillName="writer" defaultSidebarCollapsed domainName="Content" terminalTheme="write" />;
}
