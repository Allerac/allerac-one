jest.mock('@/app/services/instructions/domain-instructions.service', () => ({
  domainInstructionsService: {
    learn: jest.fn(),
  },
}));

import { domainInstructionsService } from '@/app/services/instructions/domain-instructions.service';
import { buildInstructionTools } from '@/app/tools/instructions.tool';

const learn = jest.mocked(domainInstructionsService.learn);

describe('learn_instruction', () => {
  beforeEach(() => learn.mockReset());

  test('injects user, domain, and source conversation', async () => {
    learn.mockResolvedValueOnce({
      added: [{
        id: 'instruction-1',
        instruction: 'Always use euros.',
        source: 'explicit',
        status: 'active',
        evidence: null,
        sourceConversationId: 'conversation-1',
        sourceSummaryId: null,
        createdAt: new Date().toISOString(),
      }],
      content: '## Learned by Allerac\n- Always use euros.',
    });

    const result = await buildInstructionTools('user-1', 'finance', 'conversation-1')
      .learn_instruction({ instruction: 'Always use euros.' });

    expect(learn).toHaveBeenCalledWith({
      userId: 'user-1',
      domainSlug: 'finance',
      instructions: ['Always use euros.'],
      source: 'explicit',
      evidence: null,
      sourceConversationId: 'conversation-1',
    });
    expect(result).toMatchObject({
      success: true,
      learned: true,
      instruction_id: 'instruction-1',
      domain_slug: 'finance',
    });
  });
});
