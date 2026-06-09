import { redirect } from 'next/navigation';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import WorkspaceProjectView from './WorkspaceProjectView';

export default async function WorkspaceProjectPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  }

  return <WorkspaceProjectView path={path} userId={user.id} />;
}
