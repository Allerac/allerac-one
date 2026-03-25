import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { ShellTool } from '@/app/tools/shell.tool';
import path from 'path';

const authService = new AuthService();

const WORKSPACE_BASE = '/workspace/projects';

function sanitizePath(input: string, userId: string): string | null {
  const userRoot = `${WORKSPACE_BASE}/${userId}`;
  const raw = (input || '').trim() || userRoot;
  const resolved = path.resolve(raw);
  if (resolved !== userRoot && !resolved.startsWith(userRoot + '/')) return null;
  return resolved;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

function buildTree(lines: string[], rootPath: string): TreeNode {
  const root: TreeNode = { name: path.basename(rootPath), path: rootPath, type: 'dir', children: [] };
  const nodeMap = new Map<string, TreeNode>([[rootPath, root]]);

  // Sort so dirs are processed before their children
  const sorted = lines.slice().sort();

  for (const line of sorted) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const type = line[0] === 'd' ? 'dir' : 'file';
    const nodePath = line.slice(tab + 1);
    if (nodePath === rootPath) continue;

    const parentPath = path.dirname(nodePath);
    const parent = nodeMap.get(parentPath);
    if (!parent) continue;

    const node: TreeNode = {
      name: path.basename(nodePath),
      path: nodePath,
      type,
      ...(type === 'dir' ? { children: [] } : {}),
    };
    parent.children!.push(node);
    if (type === 'dir') nodeMap.set(nodePath, node);
  }

  // Sort children: dirs first, then files, alphabetically
  function sortChildren(node: TreeNode) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  }
  sortChildren(root);

  return root;
}

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const inputPath = url.searchParams.get('path') || '';
  const safePath = sanitizePath(inputPath, user.id);
  if (!safePath) return Response.json({ error: 'Invalid path' }, { status: 400 });

  const shell = new ShellTool();
  const cmd = [
    `(find "${safePath}" -maxdepth 5`,
    `  ! -path '*/node_modules/*'`,
    `  ! -path '*/.git/*'`,
    `  ! -path '*/__pycache__/*'`,
    `  ! -path '*/.next/*'`,
    `  -type d -print | sed 's/^/d\\t/'`,
    `;`,
    `find "${safePath}" -maxdepth 5`,
    `  ! -path '*/node_modules/*'`,
    `  ! -path '*/.git/*'`,
    `  ! -path '*/__pycache__/*'`,
    `  ! -path '*/.next/*'`,
    `  -type f -print | sed 's/^/f\\t/'`,
    `) | sort 2>/dev/null | head -500`,
  ].join(' ');

  const result = await shell.execute(cmd);

  if (!result.success && result.exitCode !== 0) {
    return Response.json({ error: 'Failed to list directory', detail: result.stderr }, { status: 500 });
  }

  const lines = result.stdout.split('\n').filter(Boolean);
  const tree = buildTree(lines, safePath);

  return Response.json({ tree });
}
