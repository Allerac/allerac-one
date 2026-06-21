// Pure tool definitions — no Node.js/server imports.

export const LOGS_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_logs',
      description:
        'Read recent Allerac system logs from the live in-memory buffer. Use this to diagnose errors, investigate warnings, or find patterns that may indicate bugs. Filter by level and/or context to narrow down. Always start with level "error" when looking for bugs.',
      parameters: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['log', 'info', 'warn', 'error'],
            description: 'Filter by log level. Use "error" to find crashes/bugs, "warn" for warnings, omit to get all levels.',
          },
          context: {
            type: 'string',
            description:
              'Filter by service context (e.g. "ChatRoute", "DB", "LLM", "Auth", "Scheduler", "WorkerRunner"). Omit to read across all services.',
          },
          search: {
            type: 'string',
            description: 'Keyword to filter log messages (case-insensitive). Useful for finding logs related to a specific error or feature.',
          },
          limit: {
            type: 'number',
            description: 'Max number of entries to return (default 50, max 200). Most recent entries are returned.',
          },
        },
        required: [],
      },
    },
  },
];

export const LOGS_TOOL_NAMES = LOGS_TOOL_DEFINITIONS.map((t) => t.function.name);
