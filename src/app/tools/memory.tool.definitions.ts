export const CREATE_MEMORY_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'create_memory',
    description: 'Create a durable memory from the current conversation. Use whenever the user explicitly asks Allerac to remember, save, or memorize a fact, preference, correction, or decision. Never claim that something was remembered unless this tool succeeds.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Concise, self-contained information to remember.' },
        importance: { type: 'number', description: 'Importance from 1 to 10 (default 7).' },
        emotion: { type: 'number', enum: [-1, 0, 1], description: 'Optional sentiment: -1 negative, 0 neutral, 1 positive.' },
        domain_slug: { type: 'string', description: 'Optional domain this memory belongs to. Defaults to the current domain.' },
      },
      required: ['content'],
    },
  },
};

export const MEMORY_DOMAIN_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Search the user\'s saved conversation memories. In the Memory domain this can search across domains, or be limited with domain_slug.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words or phrases to find in memory summaries and topics.' },
          domain_slug: { type: 'string', description: 'Optional domain slug to limit the search.' },
          limit: { type: 'number', description: 'Maximum results to return (default 10, maximum 50).' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description: 'Delete one of the user\'s saved memories. Only use after the user explicitly asks to forget or delete it.',
      parameters: {
        type: 'object',
        properties: {
          memory_id: { type: 'string', description: 'UUID of the memory to delete.' },
        },
        required: ['memory_id'],
      },
    },
  },
];

export const RECALL_MEMORY_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'recall_memory',
    description: 'Search durable memories when past preferences, decisions, corrections, or conversation context would improve the answer. Defaults to the current domain.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to recall from past conversations.' },
        domain_slug: { type: 'string', description: 'Optional accessible domain to search instead of the current domain.' },
        limit: { type: 'number', description: 'Maximum results to return (default 5, maximum 20).' },
      },
      required: ['query'],
    },
  },
};
