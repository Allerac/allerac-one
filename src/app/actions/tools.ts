'use server';

import { SearchWebTool } from '@/app/tools/search-web.tool';

export async function executeWebSearch(query: string, tavilyApiKey: string) {
    const tool = new SearchWebTool(tavilyApiKey);
    return await tool.execute(query);
}
