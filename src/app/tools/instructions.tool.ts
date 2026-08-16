import { domainInstructionsService } from '@/app/services/instructions/domain-instructions.service';

export { LEARN_INSTRUCTION_TOOL_DEFINITION } from './instructions.tool.definitions';

export function buildInstructionTools(
  userId: string,
  callerDomain: string,
  conversationId?: string,
) {
  return {
    learn_instruction: async (args: { instruction: string; evidence?: string }) => {
      const instruction = args.instruction?.trim();
      if (!instruction) return { success: false, error: 'Instruction is required' };
      const result = await domainInstructionsService.learn({
        userId,
        domainSlug: callerDomain,
        instructions: [instruction],
        source: 'explicit',
        evidence: args.evidence?.trim() || null,
        sourceConversationId: conversationId || null,
      });
      return {
        success: true,
        learned: result.added.length > 0,
        instruction_id: result.added[0]?.id ?? null,
        domain_slug: callerDomain,
      };
    },
  };
}
