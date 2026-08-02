const clientQuery = jest.fn();
const release = jest.fn();

jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(async () => ({ query: clientQuery, release })),
    query: jest.fn(),
  },
}));

import { DomainInstructionsService } from '@/app/services/instructions/domain-instructions.service';

describe('DomainInstructionsService', () => {
  beforeEach(() => {
    clientQuery.mockReset();
    release.mockReset();
  });

  test('deduplicates structured instructions and materializes the prompt document atomically', async () => {
    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ base_content: 'Legacy rule.', content: 'Legacy rule.', revision: '2' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'instruction-1',
        instruction: 'Keep answers concise.',
        source: 'explicit',
        status: 'active',
        evidence: 'User asked for short answers',
        source_conversation_id: 'conversation-1',
        source_summary_id: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ instruction: 'Keep answers concise.' }] })
      .mockResolvedValueOnce({ rows: [{ revision: '3' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await new DomainInstructionsService().learn({
      userId: 'user-1',
      domainSlug: 'chat',
      instructions: ['Keep answers concise.', 'Keep answers concise.'],
      source: 'explicit',
      evidence: 'User asked for short answers',
      sourceConversationId: 'conversation-1',
    });

    expect(result.added).toHaveLength(1);
    const updateCall = clientQuery.mock.calls.find(call =>
      String(call[0]).includes('UPDATE user_domain_instructions'),
    );
    expect(updateCall?.[1][2]).toBe('Legacy rule.\n\n## Learned by Allerac\n- Keep answers concise.');
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalled();
  });
});
