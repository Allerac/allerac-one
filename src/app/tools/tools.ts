// AI Tool definitions for function calling

// Health tools are conditionally included based on HEALTH_WORKER_SECRET being set.
const HEALTH_TOOLS = process.env.HEALTH_WORKER_SECRET ? [
  {
    type: 'function',
    function: {
      name: 'get_health_summary',
      description: 'Get a summary of the user\'s health metrics (steps, calories, heart rate, sleep) for a given period. Use this when the user asks about their health trends, weekly activity, average stats, or progress.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year'],
            description: 'The time period to summarize. Default to "week" when unsure.',
          },
        },
        required: ['period'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_health_metrics',
      description: 'Get detailed health metrics (steps, heart rate, sleep, body battery) for a date range. Use this when the user wants to see specific data for a period or when building a training plan.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format',
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_snapshot',
      description: 'Get all health metrics for a single specific day. Use this when the user asks about a particular day: "how was my sleep last night?", "how many steps did I take yesterday?", "what was my body battery today?"',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_garmin_status',
      description: 'Check whether the user has a Garmin device connected and when data was last synced. Use this before other health tools if unsure whether Garmin is configured.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
] : [];

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for current information, news, facts, or any information not in your knowledge base. Use this when you need real-time or up-to-date information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up on the web',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_shell',
      description: 'Execute a shell command on the host machine. Use this to run scripts, list files, install packages, call APIs via curl, send emails via sendmail/msmtp, manipulate files, or perform any system operation. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (bash syntax)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command (optional, defaults to app root)',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (optional, default 30000)',
          },
        },
        required: ['command'],
      },
    },
  },
  ...HEALTH_TOOLS,
];
