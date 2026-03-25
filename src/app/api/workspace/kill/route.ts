import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { ShellTool } from '@/app/tools/shell.tool';

const authService = new AuthService();

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { pid } = await request.json();
  if (!pid || typeof pid !== 'number') return Response.json({ error: 'Invalid pid' }, { status: 400 });

  const userRoot = `/workspace/projects/${user.id}`;
  const shell = new ShellTool();

  // Verify the process cwd belongs to this user before killing
  const cwdResult = await shell.execute(`readlink /proc/${pid}/cwd 2>/dev/null || echo ""`);
  const cwd = cwdResult.stdout.trim();
  if (!cwd.startsWith(userRoot)) {
    return Response.json({ error: 'Process not owned by user' }, { status: 403 });
  }

  const result = await shell.execute(`kill ${pid} 2>/dev/null; sleep 0.3; kill -0 ${pid} 2>/dev/null && kill -9 ${pid} 2>/dev/null || true`);
  return Response.json({ ok: true });
}
