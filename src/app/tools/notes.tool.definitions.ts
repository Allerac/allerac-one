// Pure tool definitions — no Node.js/server imports.
// Imported by tools.ts which is bundled for the browser.

export const NOTES_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'save_note',
      description: 'Save a note to the user\'s personal vault. Use this when the user says "anota", "lembra", "salva", "save", "note that", or similar capture intent. Extract a clean title from the content when possible.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The full content of the note.',
          },
          title: {
            type: 'string',
            description: 'A short descriptive title (optional, but recommended).',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Relevant tags. Use lowercase, e.g. ["task", "health", "project-x"]. Add "task" for action items, "idea" for ideas, "reference" for documentation.',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_vault',
      description: 'Search the user\'s note vault using a natural language query. Use this when the user asks "o que tenho sobre", "tem alguma nota sobre", "what do I have about", or any recall intent.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default 5).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'List the most recent notes from the vault, optionally filtered by tag. Use for "o que tenho pra hoje?", "minhas tarefas", "show my notes", or when the user wants a summary of recent entries.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of notes to return (default 10).',
          },
          tag: {
            type: 'string',
            description: 'Filter by a specific tag (e.g. "task", "idea").',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Delete a note from the vault. Only use when the user explicitly asks to delete or remove a note.',
      parameters: {
        type: 'object',
        properties: {
          note_id: {
            type: 'string',
            description: 'The UUID of the note to delete.',
          },
        },
        required: ['note_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: 'Update the content, title, or tags of an existing note in the vault. Use when the user asks to edit, update, improve, or add to a specific note.',
      parameters: {
        type: 'object',
        properties: {
          note_id: {
            type: 'string',
            description: 'The UUID of the note to update.',
          },
          content: {
            type: 'string',
            description: 'New full content for the note (omit to keep current).',
          },
          title: {
            type: 'string',
            description: 'New title (omit to keep current).',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'New tag list — replaces existing tags entirely (omit to keep current).',
          },
        },
        required: ['note_id'],
      },
    },
  },
];
