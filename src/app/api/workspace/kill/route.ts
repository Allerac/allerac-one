import { ShellTool } from '@/app/tools/shell.tool';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { resolveUserWorkspacePath } from '@/app/lib/workspace-paths';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const { pid } = await request.json();
    if (!Number.isInteger(pid) || pid <= 0) return Response.json({ error: 'Invalid pid' }, { status: 400 });

    const shell = new ShellTool();

    // Verify the process cwd belongs to this user before killing
    const cwdResult = await shell.execute(`readlink /proc/${pid}/cwd 2>/dev/null || echo ""`);
    const cwd = cwdResult.stdout.trim();
    if (!cwd || resolveUserWorkspacePath(user.id, cwd) !== cwd) {
      return Response.json({ error: 'Process not owned by user' }, { status: 403 });
    }

    await shell.execute(`kill ${pid} 2>/dev/null; sleep 0.3; kill -0 ${pid} 2>/dev/null && kill -9 ${pid} 2>/dev/null || true`);
    return Response.json({ ok: true });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to stop process' }, { status: 500 });
  }
}
