// AI Tool definitions for function calling
import { NOTES_TOOL_DEFINITIONS } from './notes.tool.definitions';
import { EMAIL_TOOL_DEFINITIONS } from './email.tool.definitions';
import { JOBS_TOOL_DEFINITIONS } from './jobs.tool.definitions';
import { TICKETS_TOOL_DEFINITIONS } from './tickets.tool.definitions';
import { GITHUB_TOOL_DEFINITIONS } from './github.tool.definitions';
import { LOGS_TOOL_DEFINITIONS } from './logs.tool.definitions';

export { JOBS_TOOL_DEFINITIONS };
export { TICKETS_TOOL_DEFINITIONS };
export { GITHUB_TOOL_DEFINITIONS };
export { LOGS_TOOL_DEFINITIONS };

// Static registry of all available tools for admin UI
export const TOOL_REGISTRY: Array<{ name: string; label: string; description: string; group: string }> = [
  { name: 'get_today_info',             label: 'Date & Time',         description: 'Current date, time and timezone',                group: 'Core'      },
  { name: 'search_web',                 label: 'Web Search',          description: 'Search the web via Tavily',                      group: 'Core'      },
  { name: 'read_url',                   label: 'Read URL',            description: 'Fetch and read the content of a URL',            group: 'Core'      },
  { name: 'execute_shell',              label: 'Shell',               description: 'Execute bash commands in sandbox',               group: 'Dev'       },
  { name: 'get_health_summary',         label: 'Health Summary',      description: 'Aggregated health metrics (steps, sleep…)',       group: 'Health'    },
  { name: 'get_health_metrics',         label: 'Health Metrics',      description: 'Detailed health metrics for a date range',       group: 'Health'    },
  { name: 'get_daily_snapshot',         label: 'Daily Snapshot',      description: 'All health metrics for a single day',            group: 'Health'    },
  { name: 'get_garmin_status',          label: 'Garmin Status',       description: 'Check Garmin device connection',                 group: 'Health'    },
  { name: 'get_recent_activities',      label: 'Recent Activities',   description: 'Recent workouts from Garmin',                    group: 'Health'    },
  { name: 'update_social_form',         label: 'Update Post Form',    description: 'Update the social post draft form',              group: 'Social' },
  { name: 'instagram_publish_post',     label: 'Publish Post',        description: 'Publish a post to Instagram',                    group: 'Instagram' },
  { name: 'instagram_get_profile',      label: 'Get Profile',         description: 'Fetch Instagram account profile info',           group: 'Instagram' },
  { name: 'instagram_get_recent_posts', label: 'Recent Posts',        description: 'Get recent posts from Instagram account',        group: 'Instagram' },
  { name: 'draw_canvas',               label: 'Draw Canvas',         description: 'Draw or update elements on the design canvas',   group: 'Design'    },
  { name: 'edit_file',                 label: 'Edit File',           description: 'Propose a file edit — user reviews and accepts', group: 'Dev'       },
  { name: 'save_note',                 label: 'Save Note',           description: 'Save a note to the personal vault',             group: 'Notes'     },
  { name: 'query_vault',              label: 'Query Vault',         description: 'Search notes with natural language',            group: 'Notes'     },
  { name: 'list_notes',               label: 'List Notes',          description: 'List recent notes from the vault',              group: 'Notes'     },
  { name: 'delete_note',              label: 'Delete Note',         description: 'Delete a note from the vault',                  group: 'Notes'     },
  { name: 'update_note',              label: 'Update Note',         description: 'Edit the content, title, or tags of a note',    group: 'Notes'     },
  { name: 'list_emails',              label: 'List Emails',         description: 'List messages from the inbox',                   group: 'Email'     },
  { name: 'read_email',               label: 'Read Email',          description: 'Read the full content of an email',              group: 'Email'     },
  { name: 'send_email',               label: 'Send Email',          description: 'Send or reply to an email',                      group: 'Email'     },
  { name: 'list_jobs',                label: 'List Jobs',           description: 'List the user\'s scheduled jobs',                group: 'Jobs'      },
  { name: 'create_job',               label: 'Create Job',          description: 'Create a new scheduled job',                     group: 'Jobs'      },
  { name: 'update_job',               label: 'Update Job',          description: 'Update an existing scheduled job',               group: 'Jobs'      },
  { name: 'delete_job',               label: 'Delete Job',          description: 'Delete a scheduled job',                         group: 'Jobs'      },
  { name: 'toggle_job',               label: 'Toggle Job',          description: 'Enable or disable a scheduled job',              group: 'Jobs'      },
  { name: 'list_tickets',             label: 'List Tickets',        description: 'List the user\'s tickets',                       group: 'Tickets'   },
  { name: 'create_ticket',            label: 'Create Ticket',       description: 'Create a new ticket',                            group: 'Tickets'   },
  { name: 'update_ticket_status',     label: 'Update Ticket Status',description: 'Change the status of a ticket',                  group: 'Tickets'   },
  { name: 'get_ticket',               label: 'Get Ticket',          description: 'Get full details of a specific ticket',          group: 'Tickets'   },
  { name: 'github_read_file',         label: 'GitHub: Read File',   description: 'Read a file from the Allerac One repository',    group: 'GitHub'    },
  { name: 'github_list_files',        label: 'GitHub: List Files',  description: 'List files/dirs in the Allerac One repository',  group: 'GitHub'    },
  { name: 'github_create_branch',     label: 'GitHub: Create Branch', description: 'Create a branch in the Allerac One repository', group: 'GitHub'  },
  { name: 'github_commit_file',       label: 'GitHub: Commit File', description: 'Create or update a file in a branch',            group: 'GitHub'    },
  { name: 'github_replace_lines',     label: 'GitHub: Replace Lines', description: 'Replace a line range in a file on a branch',          group: 'GitHub' },
  { name: 'github_edit_file',         label: 'GitHub: Edit File',   description: 'Edit a file via find/replace (no full content needed)', group: 'GitHub' },
  { name: 'github_create_pr',         label: 'GitHub: Create PR',   description: 'Open a pull request in the Allerac One repo',    group: 'GitHub'    },
  { name: 'read_logs',                label: 'Read Logs',           description: 'Read live Allerac system logs from memory buffer', group: 'Dev'      },
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
      name: 'read_url',
      description: 'Fetch and read the full text content of a URL (article, blog post, newsletter, documentation, etc.). Use this when the user shares a link and wants a summary, analysis, or information from the page. Also use it automatically when a message contains a URL and the user clearly wants to know about its content.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The full URL to fetch and read (must start with http:// or https://)',
          },
        },
        required: ['url'],
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
  ...NOTES_TOOL_DEFINITIONS,
  ...EMAIL_TOOL_DEFINITIONS,
  {
    type: 'function',
    function: {
      name: 'update_social_form',
      description: 'Update the Social Studio form fields directly for Instagram or TikTok. Call this tool every time you generate or rewrite post content. When the user sends an image, call it once with platform, image_url, caption, tags, and TikTok title when applicable.',
      parameters: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['instagram', 'tiktok'],
            description: 'Target social platform.',
          },
          tiktok_title: {
            type: 'string',
            description: 'Short editable TikTok post title (omit for Instagram).',
          },
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
      name: 'draw_canvas',
      description: 'Draw or update elements on the design canvas. Call this whenever the user asks you to draw, design, wireframe, or visualize anything. Canvas dimensions are provided in context — use them to position and center elements correctly. You can call this multiple times to build the drawing incrementally.',
      parameters: {
        type: 'object',
        properties: {
          elements: {
            type: 'array',
            description: 'Array of canvas elements to render.',
            items: {
              type: 'object',
              properties: {
                type:        { type: 'string', enum: ['rect', 'circle', 'diamond', 'arrow', 'line', 'text'] },
                x:           { type: 'number' },
                y:           { type: 'number' },
                width:       { type: 'number' },
                height:      { type: 'number' },
                cx:          { type: 'number' },
                cy:          { type: 'number' },
                r:           { type: 'number' },
                x1:          { type: 'number' },
                y1:          { type: 'number' },
                x2:          { type: 'number' },
                y2:          { type: 'number' },
                label:       { type: 'string' },
                fill:        { type: 'string' },
                stroke:      { type: 'string' },
                strokeWidth: { type: 'number' },
                fontSize:    { type: 'number' },
                bold:        { type: 'boolean' },
                color:       { type: 'string' },
              },
              required: ['type'],
            },
          },
          mode: {
            type: 'string',
            enum: ['replace', 'append'],
            description: '"replace" clears the canvas and redraws (default). "append" adds to the existing drawing.',
          },
        },
        required: ['elements'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Propose changes to an existing file in the workspace. The user will see a diff and can accept or reject before anything is saved. Use this instead of execute_shell when modifying files the user already has open.',
      parameters: {
        type: 'object',
        properties: {
          path:        { type: 'string', description: 'Absolute path to the file (e.g. /workspace/projects/userId/my-app/src/index.ts)' },
          new_content: { type: 'string', description: 'Complete new content for the file' },
          explanation: { type: 'string', description: 'One-line summary of what was changed and why' },
        },
        required: ['path', 'new_content', 'explanation'],
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
  ...GITHUB_TOOL_DEFINITIONS,
  ...LOGS_TOOL_DEFINITIONS,
];
