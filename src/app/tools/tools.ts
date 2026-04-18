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
  {
    type: 'function',
    function: {
      name: 'get_recent_activities',
      description: 'Get recent activities from the user\'s Garmin device (workouts, exercises, etc.). Use this when the user asks about their recent activities, latest workout, or recent exercise sessions.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recent activities to retrieve (default 10, max 50). Use 1 to get just the most recent activity.',
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
      name: 'instagram_create_post_draft',
      description: 'Prepare an Instagram post draft with caption and hashtags. The system will auto-generate caption and tags from the image if not provided. Shows a preview modal for user review before publishing.',
      parameters: {
        type: 'object',
        properties: {
          image_url: {
            type: 'string',
            description: 'Public URL of the image to post, OR base64-encoded image data (data:image/jpeg;base64,...). The system will auto-generate caption and tags from this image.',
          },
          caption: {
            type: 'string',
            description: 'The caption text for the Instagram post (optional - will be auto-generated from image if not provided)',
          },
          tags: {
            type: 'string',
            description: 'Hashtags for the post, space-separated (e.g. "#tag1 #tag2 #tag3") (optional - will be auto-generated if not provided)',
          },
        },
        required: ['image_url'],
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
