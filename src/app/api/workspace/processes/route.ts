import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { ShellTool } from '@/app/tools/shell.tool';

const authService = new AuthService();

export interface ProcessInfo {
  pid: number;
  command: string;
  cwd: string;
  port?: number;
}

export async function GET(): Promise<Response> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const userRoot = `/workspace/projects/${user.id}`;
  const shell = new ShellTool();

  // Read directly from /proc — works on BusyBox/Alpine
  const result = await shell.execute(
    `for pid in $(ls /proc | grep -E '^[0-9]+$'); do
      cwd=$(readlink /proc/$pid/cwd 2>/dev/null)
      if [ -n "$cwd" ] && echo "$cwd" | grep -q "^${userRoot}"; then
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

  // Parse /proc/net/tcp to map inode → port, then map fd → inode → pid
  const portMap: Record<number, number> = {};
  const netTcp = await shell.execute(`cat /proc/net/tcp /proc/net/tcp6 2>/dev/null || true`);
  // inode → port map from tcp table (only LISTEN state = 0A)
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
}
