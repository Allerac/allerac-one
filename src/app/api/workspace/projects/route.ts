import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { ShellTool } from '@/app/tools/shell.tool';

const authService = new AuthService();

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const userRoot = `/workspace/projects/${user.id}`;
  const shell = new ShellTool();
  const result = await shell.execute(
    `find "${userRoot}" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort`
  );

  if (!result.success || !result.stdout.trim()) return Response.json({ projects: [] });

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
        return { name, path: dir, fileCount };
      })
  );

  return Response.json({ projects });
}
