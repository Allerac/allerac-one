import { ShellTool } from '@/app/tools/shell.tool';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { getUserWorkspaceRoot } from '@/app/lib/workspace-paths';

export interface ProcessInfo {
  pid: number;
  command: string;
  cwd: string;
  port?: number;
}

export async function GET(): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const userRoot = getUserWorkspaceRoot(user.id);
    const shell = new ShellTool();

    // Read directly from /proc - works on BusyBox/Alpine
    const result = await shell.execute(
      `for pid in $(ls /proc | grep -E '^[0-9]+$'); do
      cwd=$(readlink /proc/$pid/cwd 2>/dev/null)
      if [ "$cwd" = "${userRoot}" ] || echo "$cwd" | grep -q "^${userRoot}/"; then
        cmd=$(cat /proc/$pid/cmdline 2>/dev/null | tr '\\0' ' ' | sed 's/ $//')
        echo "$pid|$cwd|$cmd"
      fi
    done`
    );

    if (!result.stdout) {
      return Response.json({ processes: [] });
    }

    const processes: ProcessInfo[] = result.stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [pidStr, cwd, ...cmdParts] = line.split('|');
        const pid = parseInt(pidStr, 10);
        const command = cmdParts.join('|').trim();
        return { pid, cwd, command };
      })
      .filter(p => !isNaN(p.pid) && p.command);

    // Parse /proc/net/tcp to map inode -> port, then map fd -> inode -> pid
    const portMap: Record<number, number> = {};
    const netTcp = await shell.execute(`cat /proc/net/tcp /proc/net/tcp6 2>/dev/null || true`);
    // inode -> port map from tcp table (only LISTEN state = 0A)
    const inodeToPort: Record<string, number> = {};
    for (const line of netTcp.stdout.split('\n').slice(1).filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts[3] === '0A') { // LISTEN
        const port = parseInt(parts[1].split(':').pop() || '0', 16);
        const inode = parts[9];
        if (port) inodeToPort[inode] = port;
      }
    }
    // For each user process, find its file descriptors and match socket inodes
    for (const p of processes) {
      const fdResult = await shell.execute(
        `ls -la /proc/${p.pid}/fd 2>/dev/null | grep socket || true`
      );
      for (const line of fdResult.stdout.split('\n').filter(Boolean)) {
        const m = line.match(/socket:\[(\d+)\]/);
        if (m && inodeToPort[m[1]]) {
          portMap[p.pid] = inodeToPort[m[1]];
          break;
        }
      }
    }

    const enriched = processes.map(p => ({
      ...p,
      port: portMap[p.pid],
    }));

    return Response.json({ processes: enriched });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to list processes' }, { status: 500 });
  }
}
