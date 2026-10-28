// Pure tool definitions — no Node.js/server imports.
// Federation tools let an admin's chat agent talk to agents on paired Units
// (federation P3). Never offered in public domains or to federated requests.

export const FEDERATION_TOOL_NAMES = ['list_peer_agents', 'ask_peer_agent'];

export const FEDERATION_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_peer_agents',
      description:
        'List the agents available on paired Allerac Units (other Units this one is connected to). Use before ask_peer_agent to find the right Unit and agent.',
      parameters: {
        type: 'object',
        properties: {
          peer: {
            type: 'string',
            description: 'Optional Unit name to list agents for a single paired Unit. Omit to list all paired Units.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_peer_agent',
      description:
        'Ask an agent on a paired Allerac Unit a short question and get its answer. The other Unit answers with its own data and tools. Attribute the answer to that Unit.',
      parameters: {
        type: 'object',
        properties: {
          peer: { type: 'string', description: 'Paired Unit name, as returned by list_peer_agents.' },
          agent: { type: 'string', description: 'Agent id on that Unit, as returned by list_peer_agents.' },
          question: { type: 'string', description: 'Self-contained question (max 4000 characters).' },
        },
        required: ['peer', 'agent', 'question'],
      },
    },
  },
];
