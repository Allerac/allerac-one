export { LOGS_TOOL_DEFINITIONS, LOGS_TOOL_NAMES } from './logs.tool.definitions';

import type { LogLevel } from '@/lib/logger-shared';

interface ReadLogsArgs {
  level?: LogLevel;
  context?: string;
  search?: string;
  limit?: number;
}

export function buildLogsTool() {
  return {
    read_logs: async (args: ReadLogsArgs) => {
      // logBuffer lives in the same Next.js server process — direct import, no HTTP.
      const { logBuffer } = await import('@/lib/logger');
      const all = logBuffer.getAll();

      let entries = all;

      if (args.level) {
        entries = entries.filter((e) => e.level === args.level);
      }
      if (args.context) {
        const ctx = args.context.toLowerCase();
        entries = entries.filter((e) => e.context.toLowerCase().includes(ctx));
      }
      if (args.search) {
        const kw = args.search.toLowerCase();
        entries = entries.filter((e) => e.message.toLowerCase().includes(kw));
      }

      const limit = Math.min(args.limit ?? 50, 200);
      // Most recent first
      entries = entries.slice(-limit).reverse();

      return {
        total_in_buffer: all.length,
        returned: entries.length,
        entries: entries.map((e) => ({
          id: e.id,
          ts: e.ts,
          level: e.level,
          context: e.context,
          message: e.message,
        })),
      };
    },
  };
}
