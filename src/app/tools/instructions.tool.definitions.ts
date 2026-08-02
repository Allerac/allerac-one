export const LEARN_INSTRUCTION_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'learn_instruction',
    description: 'Teach Allerac a durable standing instruction for future conversations in the current domain. Use for explicit preferences, corrections, recurring constraints, or lasting rules. Do not use for one-off requests or temporary facts. The current user and domain are assigned automatically.',
    parameters: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'A concise, self-contained standing instruction written as an imperative.',
        },
        evidence: {
          type: 'string',
          description: 'Optional short explanation of what the user said that established this rule.',
        },
      },
      required: ['instruction'],
    },
  },
};
