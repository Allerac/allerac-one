import { ShellTool } from '@/app/tools/shell.tool';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getUserWorkspaceRoot } from '@/app/lib/workspace-paths';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function GET(): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const userRoot = getUserWorkspaceRoot(user.id);
    const shell = new ShellTool();
    const result = await shell.execute(
      `find ${shellQuote(userRoot)} -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort`
    );

    if (!result.success || !result.stdout.trim()) return Response.json({ projects: [] });

    const projects = await Promise.all(
      result.stdout
        .split('\n')
        .filter(Boolean)
        .map(async dir => {
          const name = dir.split('/').pop() || dir;
          const countResult = await shell.execute(
            `find ${shellQuote(dir)} -type f ! -path '*/node_modules/*' ! -path '*/.git/*' 2>/dev/null | wc -l`
          );
          const fileCount = parseInt(countResult.stdout.trim() || '0', 10);
          return { name, path: dir, fileCount };
        })
    );

    return Response.json({ projects });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to list projects' }, { status: 500 });
  }
}
