import { ShellTool } from '@/app/tools/shell.tool';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getUserWorkspaceRoot, resolveShellCwd } from '@/app/lib/workspace-paths';

const DEFAULT_TIMEOUT = 15000;

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const { command, cwd, timeout } = await request.json();
    if (!command || typeof command !== 'string') {
      return Response.json({ error: 'Missing command' }, { status: 400 });
    }

    const safeCwdPath = resolveShellCwd(user.id, cwd || getUserWorkspaceRoot(user.id));
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
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : 'Command failed' }, { status: 500 });
  }
}
