jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('@/app/services/instructions/domain-instructions.service', () => ({
  domainInstructionsService: {
    learn: jest.fn(),
  },
}));

import pool from '@/app/clients/db';
import { InstructionDistillerService } from '@/app/services/memory/instruction-distiller.service';
import { domainInstructionsService } from '@/app/services/instructions/domain-instructions.service';

const query = pool.query as jest.Mock;
const fetchMock = jest.fn();
const learn = jest.mocked(domainInstructionsService.learn);

describe('InstructionDistillerService', () => {
  beforeEach(() => {
    query.mockReset();
    fetchMock.mockReset();
    learn.mockReset();
    global.fetch = fetchMock;
  });

  test('appends learned instructions without rewriting existing manual content', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ content: 'Always answer in Portuguese.', revision: '3' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'summary-1',
        summary: 'The user prefers short answers.',
        key_topics: ['preference'],
        importance_score: 8,
      }] });
    learn.mockResolvedValueOnce({
      added: [{
        id: 'instruction-1',
        instruction: 'Keep answers concise.',
        source: 'distilled',
        status: 'active',
        evidence: null,
        sourceConversationId: null,
        sourceSummaryId: 'summary-1',
        createdAt: new Date().toISOString(),
      }],
      content: 'Always answer in Portuguese.\n\n## Learned by Allerac\n- Keep answers concise.',
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"instructions":["Keep answers concise."]}' } }],
      }),
    });

    const result = await new InstructionDistillerService().distill({
      userId: 'user-1',
      domainSlug: 'write',
      llmConfig: { endpoint: 'https://example.test', apiKey: 'key', model: 'model' },
      sourceSummaryId: 'summary-1',
    });

    expect(result).toEqual({ updated: true });
    expect(learn).toHaveBeenCalledWith({
      userId: 'user-1',
      domainSlug: 'write',
      instructions: ['Keep answers concise.'],
      source: 'distilled',
      sourceSummaryId: 'summary-1',
    });
  });

  test('reports no update when all distilled instructions are duplicates', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ content: 'Manual content', revision: '5' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'summary-1',
        summary: 'A durable preference',
        key_topics: ['preference'],
        importance_score: 9,
      }] });
    learn.mockResolvedValueOnce({ added: [], content: 'Manual content' });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"instructions":["Use tables for comparisons."]}' } }],
      }),
    });

    const result = await new InstructionDistillerService().distill({
      userId: 'user-1',
      domainSlug: 'finance',
      llmConfig: 'token',
    });

    expect(result).toEqual({ updated: false });
    expect(query).toHaveBeenCalledTimes(2);
  });

  test('does nothing when the model finds no durable instruction', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ content: 'Manual content', revision: '2' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'summary-1',
        summary: 'A one-off request',
        key_topics: [],
        importance_score: 3,
      }] });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"instructions":[]}' } }],
      }),
    });

    await expect(new InstructionDistillerService().distill({
      userId: 'user-1',
      domainSlug: 'chat',
      llmConfig: 'token',
    })).resolves.toEqual({ updated: false });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
