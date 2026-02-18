'use server';

import { SearchWebTool } from '@/app/tools/search-web.tool';

export async function executeWebSearch(query: string, tavilyApiKey: string) {
    const tool = new SearchWebTool(tavilyApiKey);
    return await tool.execute(query);
}

export async function executeShellCommand(command: string, cwd?: string, timeout?: number) {
    const { ShellTool } = await import('@/app/tools/shell.tool');
    const tool = new ShellTool();
    return await tool.execute(command, cwd, timeout);
}
