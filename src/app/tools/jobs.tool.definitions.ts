// Pure tool definitions — no Node.js/server imports.
// Imported by tools.ts (browser bundle) and the chat API route.

export const JOBS_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_jobs',
      description: "List the user's scheduled jobs. Use when the user asks to see, list, or check their scheduled tasks or jobs.",
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
      name: 'create_job',
      description: "Create a new scheduled job. Use when the user asks to schedule, automate, or create a recurring task. Always call get_today_info first to know the current date/timezone. Build a valid cron expression from the user's intent (e.g. 'every day at 9am' → '0 9 * * *'). Convert the user's local time to UTC before building the cron.",
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short descriptive name for the job (e.g. "Daily news digest").',
          },
          prompt: {
            type: 'string',
            description: 'The prompt the AI will execute when the job runs (e.g. "Summarise the latest AI news and send it to me").',
          },
          cron_expr: {
            type: 'string',
            description: 'Valid 5-field cron expression in UTC (e.g. "0 9 * * *" for every day at 09:00 UTC). Must pass validation.',
          },
          channels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Delivery channels. Currently supported: ["telegram"]. Default to ["telegram"] if the user doesn\'t specify.',
          },
          enabled: {
            type: 'boolean',
            description: 'Whether to enable the job immediately. Default true.',
          },
        },
        required: ['name', 'prompt', 'cron_expr'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_job',
      description: 'Update an existing scheduled job. Use when the user asks to change the schedule, prompt, name, or channels of an existing job. Call list_jobs first if you need to find the job ID.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'UUID of the job to update.',
          },
          name: {
            type: 'string',
            description: 'New name (omit to keep current).',
          },
          prompt: {
            type: 'string',
            description: 'New prompt (omit to keep current).',
          },
          cron_expr: {
            type: 'string',
            description: 'New 5-field cron expression in UTC (omit to keep current).',
          },
          channels: {
            type: 'array',
            items: { type: 'string' },
            description: 'New channel list (omit to keep current).',
          },
          enabled: {
            type: 'boolean',
            description: 'Enable or disable the job (omit to keep current).',
          },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_job',
      description: 'Delete a scheduled job permanently. Only use when the user explicitly asks to delete or remove a job. Call list_jobs first to find the job ID if needed.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'UUID of the job to delete.',
          },
        },
        required: ['job_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_job',
      description: 'Enable or disable a scheduled job without changing anything else. Use when the user says "pause", "disable", "enable", or "activate" a job.',
      parameters: {
        type: 'object',
        properties: {
          job_id: {
            type: 'string',
            description: 'UUID of the job to toggle.',
          },
          enabled: {
            type: 'boolean',
            description: 'true to enable, false to disable.',
          },
        },
        required: ['job_id', 'enabled'],
      },
    },
  },
];
