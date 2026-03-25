import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { ShellTool } from '@/app/tools/shell.tool';
import path from 'path';

const authService = new AuthService();
const WORKSPACE_BASE = '/workspace/projects';
const DEFAULT_TIMEOUT = 15000;

function safeCwd(input: string, userId: string): string | null {
  const userRoot = `${WORKSPACE_BASE}/${userId}`;
  const resolved = path.resolve(input || '');
  if (!resolved.startsWith(userRoot + '/') && resolved !== userRoot) return null;
  return resolved;
}

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { command, cwd, timeout } = await request.json();
  if (!command || typeof command !== 'string') {
    return Response.json({ error: 'Missing command' }, { status: 400 });
  }

  const safeCwdPath = safeCwd(cwd || `${WORKSPACE_BASE}/${user.id}`, user.id);
  if (!safeCwdPath) return Response.json({ error: 'Invalid cwd' }, { status: 400 });

  const shell = new ShellTool();

  // Background command: wrap with nohup so the process survives after the shell exits
  const isBackground = command.trimEnd().endsWith('&');
  let actualCommand = command;
  let actualTimeout = timeout ?? DEFAULT_TIMEOUT;
  if (isBackground) {
    const logFile = `/tmp/allerac-bg-${Date.now()}.log`;
    const inner = command.trimEnd().slice(0, -1).trim(); // strip trailing &
    actualCommand = `nohup sh -c ${JSON.stringify(inner)} > ${logFile} 2>&1 & echo $!`;
    actualTimeout = 5000; // just needs to spawn, not wait
  }

  const result = await shell.execute(actualCommand, safeCwdPath, actualTimeout);

  return Response.json({
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    success: result.success,
    duration_ms: result.duration_ms,
    background: isBackground,
  });
}
