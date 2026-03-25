import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import WorkspaceProjectView from './WorkspaceProjectView';

const authService = new AuthService();

export default async function WorkspaceProjectPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/');
  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/');

  return <WorkspaceProjectView path={path} userId={user.id} />;
}
