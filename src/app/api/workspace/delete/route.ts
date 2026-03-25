import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { ShellTool } from '@/app/tools/shell.tool';
import path from 'path';

const authService = new AuthService();
const WORKSPACE_BASE = '/workspace/projects';

function safePath(input: string, userId: string): string | null {
  const userRoot = `${WORKSPACE_BASE}/${userId}`;
  const resolved = path.resolve(input || '');
  if (resolved === userRoot) return null; // never delete user root
  if (!resolved.startsWith(userRoot + '/')) return null;
  return resolved;
}

export async function DELETE(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { path: inputPath } = await request.json();
  const safe = safePath(inputPath, user.id);
  if (!safe) return Response.json({ error: 'Invalid path' }, { status: 400 });

  const shell = new ShellTool();
  const result = await shell.execute(`rm -rf -- "${safe}"`);
  if (!result.success) return Response.json({ error: result.stderr || 'Delete failed' }, { status: 500 });

  return Response.json({ ok: true });
}
