import { ShellTool } from '@/app/tools/shell.tool';
import path from 'path';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { resolveUserWorkspaceFilePath } from '@/app/lib/workspace-paths';

const MAX_BYTES = 500 * 1024; // 500 KB

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', sh: 'bash', bash: 'bash', zsh: 'bash',
  json: 'json', md: 'markdown', html: 'html', css: 'css',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  rs: 'rust', go: 'go', java: 'java', rb: 'ruby', php: 'php',
  c: 'c', cpp: 'cpp', h: 'c', dockerfile: 'dockerfile',
  xml: 'xml', graphql: 'graphql', txt: 'text',
};

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const url = new URL(request.url);
    const inputPath = url.searchParams.get('path') || '';
    const safePath = resolveUserWorkspaceFilePath(user.id, inputPath);
    if (!safePath) return Response.json({ error: 'Invalid path' }, { status: 400 });

    const shell = new ShellTool();

    // Check size first
    const sizeResult = await shell.execute(`stat -c%s -- ${shellQuote(safePath)} 2>/dev/null || echo 0`);
    const fileSize = parseInt(sizeResult.stdout.trim() || '0', 10);
    if (fileSize > MAX_BYTES) {
      return Response.json({ error: `File too large to display (${Math.round(fileSize / 1024)} KB > 500 KB)` }, { status: 413 });
    }

    const result = await shell.execute(`cat -- ${shellQuote(safePath)} 2>&1`);

    if (!result.success) {
      return Response.json({ error: result.stderr || 'Could not read file' }, { status: 500 });
    }

    // Detect binary by null bytes
    if (result.stdout.includes('\x00')) {
      return Response.json({ error: 'Binary file — cannot display' }, { status: 422 });
    }

    const ext = path.extname(safePath).slice(1).toLowerCase();
    const basename = path.basename(safePath).toLowerCase();
    const language = EXT_LANG[ext] || EXT_LANG[basename] || 'text';

    return Response.json({ content: result.stdout, path: safePath, language });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : 'Could not read file' }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const { path: inputPath, content } = await request.json();
    if (typeof content !== 'string') return Response.json({ error: 'Missing content' }, { status: 400 });
    const safePath = resolveUserWorkspaceFilePath(user.id, inputPath || '');
    if (!safePath) return Response.json({ error: 'Invalid path' }, { status: 400 });

    const b64 = Buffer.from(content, 'utf8').toString('base64');
    const shell = new ShellTool();
    const tmpFile = `/tmp/allerac-write-${Date.now()}`;
    const result = await shell.execute(
      `printf '%s' ${shellQuote(b64)} > ${shellQuote(`${tmpFile}.b64`)} && base64 -d ${shellQuote(`${tmpFile}.b64`)} > ${shellQuote(tmpFile)} && mv ${shellQuote(tmpFile)} ${shellQuote(safePath)} && rm -f ${shellQuote(`${tmpFile}.b64`)}`
    );
    if (!result.success) {
      return Response.json({ error: result.stderr || 'Write failed' }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : 'Write failed' }, { status: 500 });
  }
}
