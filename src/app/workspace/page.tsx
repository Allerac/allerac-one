import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/app/services/auth/auth.service';
import { ShellTool } from '@/app/tools/shell.tool';
import WorkspaceProjectList from './WorkspaceProjectList';

const authService = new AuthService();

async function getProjects(userId: string): Promise<{ name: string; fileCount: number }[]> {
  const userRoot = `/workspace/projects/${userId}`;
  const shell = new ShellTool();
  const result = await shell.execute(
    `find "${userRoot}" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort`
  );
  if (!result.success || !result.stdout.trim()) return [];

  const projects = await Promise.all(
    result.stdout
      .split('\n')
      .filter(Boolean)
      .map(async dir => {
        const name = dir.split('/').pop() || dir;
        const countResult = await shell.execute(
          `find "${dir}" -type f ! -path '*/node_modules/*' ! -path '*/.git/*' 2>/dev/null | wc -l`
        );
        const fileCount = parseInt(countResult.stdout.trim() || '0', 10);
        return { name, fileCount };
      })
  );

  return projects;
}

export default async function WorkspacePage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) redirect('/');
  const user = await authService.validateSession(sessionToken);
  if (!user) redirect('/');

  const projects = await getProjects(user.id);
  return <WorkspaceProjectList projects={projects} userId={user.id} />;
}
