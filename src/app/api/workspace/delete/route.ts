import { ShellTool } from '@/app/tools/shell.tool';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getUserWorkspaceRoot, resolveUserWorkspaceFilePath } from '@/app/lib/workspace-paths';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const { path: inputPath } = await request.json();
    const safe = resolveUserWorkspaceFilePath(user.id, inputPath);
    if (!safe || safe === getUserWorkspaceRoot(user.id)) return Response.json({ error: 'Invalid path' }, { status: 400 });

    const shell = new ShellTool();
    const result = await shell.execute(`rm -rf -- ${shellQuote(safe)}`);
    if (!result.success) return Response.json({ error: result.stderr || 'Delete failed' }, { status: 500 });

    return Response.json({ ok: true });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : 'Delete failed' }, { status: 500 });
  }
}
