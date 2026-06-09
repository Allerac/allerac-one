import { redirect } from 'next/navigation';
import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getUserWorkspaceRoot, quoteShellArg } from '@/app/lib/workspace-paths';
import { ShellTool } from '@/app/tools/shell.tool';
import WorkspaceProjectList from './WorkspaceProjectList';

async function getProjects(userId: string): Promise<{ name: string; fileCount: number }[]> {
  const userRoot = getUserWorkspaceRoot(userId);
  const shell = new ShellTool();
  const result = await shell.execute(
    `find ${quoteShellArg(userRoot)} -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort`
  );
  if (!result.success || !result.stdout.trim()) return [];

  const projects = await Promise.all(
    result.stdout
      .split('\n')
      .filter(Boolean)
      .map(async dir => {
        const name = dir.split('/').pop() || dir;
        const countResult = await shell.execute(
          `find ${quoteShellArg(dir)} -type f ! -path '*/node_modules/*' ! -path '*/.git/*' 2>/dev/null | wc -l`
        );
        const fileCount = parseInt(countResult.stdout.trim() || '0', 10);
        return { name, fileCount };
      })
  );

  return projects;
}

export default async function WorkspacePage() {
  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  }

  const projects = await getProjects(user.id);
  return <WorkspaceProjectList projects={projects} userId={user.id} />;
}
