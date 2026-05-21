// AI Tool definitions for function calling

// Static registry of all available tools for admin UI
export const TOOL_REGISTRY: Array<{ name: string; label: string; description: string; group: string }> = [
  { name: 'get_today_info',             label: 'Date & Time',         description: 'Current date, time and timezone',                group: 'Core'      },
  { name: 'search_web',                 label: 'Web Search',          description: 'Search the web via Tavily',                      group: 'Core'      },
  { name: 'execute_shell',              label: 'Shell',               description: 'Execute bash commands in sandbox',               group: 'Dev'       },
  { name: 'get_health_summary',         label: 'Health Summary',      description: 'Aggregated health metrics (steps, sleep…)',       group: 'Health'    },
  { name: 'get_health_metrics',         label: 'Health Metrics',      description: 'Detailed health metrics for a date range',       group: 'Health'    },
  { name: 'get_daily_snapshot',         label: 'Daily Snapshot',      description: 'All health metrics for a single day',            group: 'Health'    },
  { name: 'get_garmin_status',          label: 'Garmin Status',       description: 'Check Garmin device connection',                 group: 'Health'    },
  { name: 'get_recent_activities',      label: 'Recent Activities',   description: 'Recent workouts from Garmin',                    group: 'Health'    },
  { name: 'update_instagram_form',      label: 'Update Post Form',    description: 'Update the Instagram post draft form',           group: 'Instagram' },
  { name: 'instagram_publish_post',     label: 'Publish Post',        description: 'Publish a post to Instagram',                    group: 'Instagram' },
  { name: 'instagram_get_profile',      label: 'Get Profile',         description: 'Fetch Instagram account profile info',           group: 'Instagram' },
  { name: 'instagram_get_recent_posts', label: 'Recent Posts',        description: 'Get recent posts from Instagram account',        group: 'Instagram' },
];

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
  {
    type: 'function',
    function: {
      name: 'get_recent_activities',
      description: 'Get recent activities from the user\'s Garmin device (workouts, exercises, etc.). Use this when the user asks about their recent activities, latest workout, or recent exercise sessions. When the health dashboard context provides a date range, pass those dates as start_date/end_date.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recent activities to retrieve (default 10, max 50). Use 1 to get just the most recent activity.',
          },
          start_date: {
            type: 'string',
            description: 'Filter activities from this date (YYYY-MM-DD). Use the start of the date range the user is currently viewing.',
          },
          end_date: {
            type: 'string',
            description: 'Filter activities up to this date (YYYY-MM-DD). Use the end of the date range the user is currently viewing.',
          },
        },
        required: [],
      },
    },
  },
] : [];

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_today_info',
      description: 'Get the current date, time, weekday, and timezone. Call this at the start of every conversation to know what day it is, before answering any time-sensitive question.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
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
      description: 'Execute a shell command in a sandboxed Linux environment (bash). Use ONLY for tasks that require actually running something: creating files on disk, setting up projects, installing packages, running scripts. Do NOT use this tool for questions, analysis, math, or anything you can answer from knowledge. IMPORTANT: (1) each call is stateless — chain everything with && in one call. (2) Projects go in /workspace/projects/ (system will auto-inject your user ID). (3) Write multi-line files with heredoc: cat > file.js << \'HEREDOC\' ... HEREDOC. Never use echo with single quotes for code. (4) Servers started here are NOT accessible from the browser. Available: node, npm, python3, git, curl, standard unix tools. Do NOT use npx.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute. Chain multiple steps with && in a single call.',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (must already exist). Prefer using cd within the command instead.',
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
  {
    type: 'function',
    function: {
      name: 'update_instagram_form',
      description: 'Update the Instagram post form fields directly. Call this tool EVERY TIME you generate, write, improve, or rewrite content for the user\'s post. IMPORTANT: when the user sends an image and asks to generate a post, call this tool ONCE with image_url + caption + tags all together in a single call — do not call it multiple times or write content only in chat.',
      parameters: {
        type: 'object',
        properties: {
          caption: {
            type: 'string',
            description: 'New caption text (omit to keep current)',
          },
          tags: {
            type: 'string',
            description: 'New hashtags, space-separated e.g. "#tag1 #tag2" (omit to keep current)',
          },
          price: {
            type: 'string',
            description: 'Product price in euros, digits only e.g. "29.99" (omit to keep current)',
          },
          is_product: {
            type: 'boolean',
            description: 'Whether this is a product post (omit to keep current)',
          },
          image_url: {
            type: 'string',
            description: 'Image URL or base64 data URI to set in the form (omit to keep current image). Use the image the user attached to this message.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'instagram_publish_post',
      description: 'Publish a post to the user\'s Instagram account. Only use this when a public image URL is already available. If the user is sending an image from the chat, use instagram_create_post_draft instead.',
      parameters: {
        type: 'object',
        properties: {
          caption: {
            type: 'string',
            description: 'The caption text for the Instagram post, including hashtags.',
          },
          image_url: {
            type: 'string',
            description: 'Public URL of the image to post. Must be publicly accessible.',
          },
        },
        required: ['caption'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'instagram_get_profile',
      description: 'Get the connected Instagram account profile info (username, followers, bio, media count).',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'instagram_get_recent_posts',
      description: 'Get the most recent posts from the connected Instagram account.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of posts to retrieve (default 6, max 12).',
          },
        },
        required: [],
      },
    },
  },
];
