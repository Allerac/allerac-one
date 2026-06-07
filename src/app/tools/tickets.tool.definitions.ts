// Pure tool definitions — no Node.js/server imports.

export const TICKETS_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_tickets',
      description: "List the user's tickets. Use when asked to see, list, or check tickets. Can filter by status or type.",
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'in_progress', 'resolved', 'cancelled'],
            description: 'Filter by status (omit to list all).',
          },
          type: {
            type: 'string',
            enum: ['bug', 'task', 'improvement', 'question'],
            description: 'Filter by ticket type (omit to list all).',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tickets to return (default 20).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ticket',
      description: "Create a new ticket. Use when the user reports a bug, requests a task, improvement, or has a question they want tracked.",
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short, descriptive title for the ticket.',
          },
          description: {
            type: 'string',
            description: 'Detailed description of the ticket (optional but recommended).',
          },
          type: {
            type: 'string',
            enum: ['bug', 'task', 'improvement', 'question'],
            description: 'Type of ticket. Use "bug" for errors/defects, "task" for work items, "improvement" for enhancements, "question" for queries.',
          },
          explicit_urgency: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: 'Priority override. Omit to let the system auto-score based on the description.',
          },
        },
        required: ['title', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_ticket_status',
      description: "Change a ticket's status. Use when the user wants to start, resolve, cancel, or reopen a ticket. Call list_tickets first if you need to find the ticket ID.",
      parameters: {
        type: 'object',
        properties: {
          ticket_id: {
            type: 'string',
            description: 'UUID of the ticket to update.',
          },
          status: {
            type: 'string',
            enum: ['open', 'in_progress', 'resolved', 'cancelled'],
            description: 'New status for the ticket.',
          },
          resolution_notes: {
            type: 'string',
            description: 'Optional notes explaining the resolution (used when setting status to "resolved").',
          },
        },
        required: ['ticket_id', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ticket',
      description: "Get full details of a specific ticket, including its timeline of events. Use when the user asks about a specific ticket.",
      parameters: {
        type: 'object',
        properties: {
          ticket_id: {
            type: 'string',
            description: 'UUID of the ticket.',
          },
        },
        required: ['ticket_id'],
      },
    },
  },
];
