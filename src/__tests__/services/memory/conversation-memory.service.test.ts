import '../../../__tests__/__mocks__/db'; // Import mock first
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import pool from '@/app/clients/db';

const mockQuery = (pool as any).query;

// Mock global fetch
global.fetch = jest.fn();

describe('ConversationMemoryService', () => {
  let memoryService: ConversationMemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    memoryService = new ConversationMemoryService('github_token_123');
  });

  describe('shouldSummarizeConversation()', () => {
    it('should return false if summary already exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'summary_123' }] }); // Summary exists

      const result = await memoryService.shouldSummarizeConversation('conv_123');

      expect(result).toBe(false);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return false if conversation has less than 4 messages', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No summary
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] }); // 2 messages

      const result = await memoryService.shouldSummarizeConversation('conv_123');

      expect(result).toBe(false);
    });

    it('should return true if conversation has 4+ messages and no summary', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No summary
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '4' }] }); // 4 messages

      const result = await memoryService.shouldSummarizeConversation('conv_123');

      expect(result).toBe(true);
    });

    it('should return true for 5+ messages', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No summary
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] }); // 10 messages

      const result = await memoryService.shouldSummarizeConversation('conv_123');

      expect(result).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await memoryService.shouldSummarizeConversation('conv_123');

      expect(result).toBe(false);
    });
  });

  describe('generateConversationSummary()', () => {
    it('should return null if conversation has less than 2 messages', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: 'user', content: 'Hello' }] });

      const result = await memoryService.generateConversationSummary('conv_123', 'user_456');

      expect(result).toBeNull();
    });

    it('should generate summary from GitHub API response', async () => {
      const messages = [
        { role: 'user', content: 'How do I learn Python?' },
        { role: 'assistant', content: 'Start with basics...' },
        { role: 'user', content: 'What about advanced topics?' },
        { role: 'assistant', content: 'After basics, try...' },
      ];

      const apiResponse = {
        summary: 'Discussion about learning Python',
        key_topics: ['Python', 'learning'],
        importance_score: 7,
        emotion: 'curious',
      };

      // Mock message fetch
      mockQuery.mockResolvedValueOnce({ rows: messages });

      // Mock GitHub API response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(apiResponse),
              },
            },
          ],
        }),
      });

      // Mock save to DB
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'summary_123',
            conversation_id: 'conv_123',
            user_id: 'user_456',
            summary: apiResponse.summary,
            key_topics: apiResponse.key_topics,
            importance_score: apiResponse.importance_score,
            emotion: apiResponse.emotion,
            message_count: 4,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const result = await memoryService.generateConversationSummary('conv_123', 'user_456');

      expect(result).toBeDefined();
      expect(result?.summary).toBe(apiResponse.summary);
      expect(result?.key_topics).toEqual(apiResponse.key_topics);
      expect(result?.importance_score).toBe(7);
      expect(result?.emotion).toBe('curious');

      // Verify GitHub API was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://models.inference.ai.azure.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer github_token_123',
          }),
        })
      );
    });

    it('should save message count to database', async () => {
      const messages = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: messages });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Test summary',
                  key_topics: [],
                  importance_score: 5,
                }),
              },
            },
          ],
        }),
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'summary_123',
            message_count: 2,
            summary: 'Test summary',
            key_topics: [],
            importance_score: 5,
            emotion: null,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const result = await memoryService.generateConversationSummary('conv_123', 'user_456');

      // Verify message_count was saved
      expect(mockQuery.mock.calls[1][1]).toContain(2); // message_count in INSERT
    });

    it('should handle API failures and throw', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
        ],
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        memoryService.generateConversationSummary('conv_123', 'user_456')
      ).rejects.toThrow('Failed to generate summary');
    });

    it('should fall back when API returns non-JSON', async () => {
      const messages = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: messages });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Plain text response without JSON',
              },
            },
          ],
        }),
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'summary_123',
            summary: 'Plain text response without JSON',
            key_topics: [],
            importance_score: 5,
            emotion: null,
            message_count: 2,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const result = await memoryService.generateConversationSummary('conv_123', 'user_456');

      expect(result?.summary).toBe('Plain text response without JSON');
      expect(result?.key_topics).toEqual([]);
    });

    it('should handle empty emotion field', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
        ],
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Summary',
                  key_topics: ['topic1'],
                  importance_score: 5,
                  // emotion is undefined
                }),
              },
            },
          ],
        }),
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'summary_123',
            summary: 'Summary',
            key_topics: ['topic1'],
            importance_score: 5,
            emotion: null,
            message_count: 2,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const result = await memoryService.generateConversationSummary('conv_123', 'user_456');

      expect(result?.emotion).toBeNull();
    });
  });

  describe('getRecentSummaries()', () => {
    it('should retrieve summaries ordered by created_at DESC', async () => {
      const summaries = [
        { id: 'sum_1', importance_score: 8, created_at: '2026-04-01' },
        { id: 'sum_2', importance_score: 6, created_at: '2026-03-31' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: summaries });

      const result = await memoryService.getRecentSummaries('user_123');

      expect(result).toEqual(summaries);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        ['user_123', 3, 5] // default minImportance=3, limit=5
      );
    });

    it('should filter by minimum importance', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await memoryService.getRecentSummaries('user_123', 10, 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.anything(),
        ['user_123', 7, 10] // minImportance=7, limit=10
      );
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await memoryService.getRecentSummaries('user_123');

      expect(result).toEqual([]);
    });

    it('should return empty array when no summaries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await memoryService.getRecentSummaries('user_123');

      expect(result).toEqual([]);
    });
  });

  describe('formatMemoryContext()', () => {
    it('should return empty string for empty summaries', () => {
      const result = memoryService.formatMemoryContext([]);

      expect(result).toBe('');
    });

    it('should format summaries with date and topics', () => {
      const summaries = [
        {
          id: 'sum_1',
          summary: 'Discussed Python programming',
          created_at: '2026-04-01T10:00:00Z',
          key_topics: ['Python', 'learning'],
          emotion: null,
          importance_score: 0,
          message_count: 0,
          user_id: '',
          conversation_id: '',
        },
      ];

      const result = memoryService.formatMemoryContext(summaries);

      expect(result).toContain('PREVIOUS CONVERSATION MEMORIES');
      expect(result).toContain('Discussed Python programming');
      expect(result).toContain('Python');
      expect(result).toContain('learning');
      expect(result).toContain('Apr');
    });

    it('should handle summaries without topics', () => {
      const summaries = [
        {
          id: 'sum_1',
          summary: 'Simple summary',
          created_at: '2026-04-01T10:00:00Z',
          key_topics: [],
          emotion: null,
          importance_score: 0,
          message_count: 0,
          user_id: '',
          conversation_id: '',
        },
      ];

      const result = memoryService.formatMemoryContext(summaries);

      expect(result).toContain('Simple summary');
      expect(result).not.toContain('[Topics:');
    });

    it('should number items starting from 1', () => {
      const summaries = [
        {
          id: 'sum_1',
          summary: 'First summary',
          created_at: '2026-04-01T10:00:00Z',
          key_topics: [],
          emotion: null,
          importance_score: 0,
          message_count: 0,
          user_id: '',
          conversation_id: '',
        },
        {
          id: 'sum_2',
          summary: 'Second summary',
          created_at: '2026-04-01T09:00:00Z',
          key_topics: [],
          emotion: null,
          importance_score: 0,
          message_count: 0,
          user_id: '',
          conversation_id: '',
        },
      ];

      const result = memoryService.formatMemoryContext(summaries);

      expect(result).toContain('1.');
      expect(result).toContain('2.');
    });
  });

  describe('deleteSummary()', () => {
    it('should delete summary by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await memoryService.deleteSummary('summary_123');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM conversation_summaries WHERE id = $1',
        ['summary_123']
      );
    });

    it('should throw error on database failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(memoryService.deleteSummary('summary_123')).rejects.toThrow(
        'Failed to delete summary'
      );
    });
  });

  describe('getSummaryStats()', () => {
    it('should calculate summary statistics', async () => {
      const summaries = [
        { importance_score: 8, message_count: 15 },
        { importance_score: 6, message_count: 10 },
        { importance_score: 9, message_count: 20 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: summaries });

      const result = await memoryService.getSummaryStats('user_123');

      expect(result.totalSummaries).toBe(3);
      expect(result.totalMessages).toBe(45); // 15+10+20
      expect(result.averageImportance).toBe(7.7); // (8+6+9)/3 ≈ 7.67, rounded to 7.7
    });

    it('should return zeros for user with no summaries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await memoryService.getSummaryStats('user_new');

      expect(result.totalSummaries).toBe(0);
      expect(result.totalMessages).toBe(0);
      expect(result.averageImportance).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await memoryService.getSummaryStats('user_123');

      expect(result.totalSummaries).toBe(0);
      expect(result.totalMessages).toBe(0);
      expect(result.averageImportance).toBe(0);
    });

    it('should calculate correct average importance with decimals', async () => {
      const summaries = [
        { importance_score: 7, message_count: 10 },
        { importance_score: 8, message_count: 10 },
      ];

      mockQuery.mockResolvedValueOnce({ rows: summaries });

      const result = await memoryService.getSummaryStats('user_123');

      expect(result.averageImportance).toBe(7.5); // (7+8)/2 = 7.5
    });
  });
});
