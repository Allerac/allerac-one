// Pure tool definitions — no Node.js/server imports.
// Manager tools (multi-bot PR 7): the default agent consults the Unit's bots.
// Offered only to the default agent of an admin, never to a bot, a public
// domain or a federated request. Bots never call each other.

export const ASK_AGENT_TOOL_NAME = 'ask_agent';
export const MANAGER_TOOL_NAMES = [ASK_AGENT_TOOL_NAME];

export const ASK_AGENT_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: ASK_AGENT_TOOL_NAME,
    description:
      'Ask one of the assistants (bots) of this Unit a question and get its answer. The bot answers with its own instructions, tools and memory, read-only: it cannot save, send or schedule anything. Use it when the question falls in a bot\'s role (the bots are listed in your instructions). To combine several bots, call it once per bot. Attribute the answer to the bot.',
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Bot id (slug), as listed in your instructions, e.g. "doctor".' },
        question: { type: 'string', description: 'Self-contained question with the context the bot needs (max 4000 characters).' },
      },
      required: ['agent', 'question'],
    },
  },
};
