import { notFound, redirect } from 'next/navigation';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { isShellAllowedFor } from '@/app/lib/shell-access';
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
  // The workspace lives in the shell executor, which is admin-only by default.
  if (!isShellAllowedFor(user)) notFound();

  return <WorkspaceProjectView path={path} userId={user.id} />;
}
