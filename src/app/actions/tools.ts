'use server';

import { SearchWebTool } from '@/app/tools/search-web.tool';
import { requireCurrentUser } from '@/app/lib/auth-session';
import { normalizeWorkspaceReferences, resolveShellCwd } from '@/app/lib/workspace-paths';

export async function executeWebSearch(query: string, tavilyApiKey: string) {
    const tool = new SearchWebTool(tavilyApiKey);
    return await tool.execute(query);
}

export async function executeShellCommand(command: string, cwd?: string, timeout?: number) {
    const user = await requireCurrentUser();
    const safeCwd = resolveShellCwd(user.id, cwd);
    if (!safeCwd) {
        return {
            stdout: '',
            stderr: 'Invalid cwd. Shell commands must run inside your workspace.',
            exitCode: 1,
            success: false,
            command,
            duration_ms: 0,
        };
    }
    const { ShellTool } = await import('@/app/tools/shell.tool');
    const tool = new ShellTool();
    return await tool.execute(normalizeWorkspaceReferences(user.id, command), safeCwd, timeout);
}
