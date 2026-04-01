import '../../../__tests__/__mocks__/db'; // Import mock first
import { ChatService } from '@/app/services/database/chat.service';
import pool from '@/app/clients/db';

const mockQuery = (pool as any).query;

describe('ChatService', () => {
  let chatService: ChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    chatService = new ChatService();
  });

  describe('loadSystemMessage()', () => {
    it('should load system message for user', async () => {
      const userId = 'user_123';
      const message = 'You are a helpful assistant';

      mockQuery.mockResolvedValueOnce({
        rows: [{ system_message: message }],
      });

      const result = await chatService.loadSystemMessage(userId);

      expect(result).toBe(message);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT system_message FROM user_settings WHERE user_id = $1',
        [userId]
      );
    });

    it('should return empty string when no record found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.loadSystemMessage('user_new');

      expect(result).toBe('');
    });

    it('should return empty string when system_message is null', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ system_message: null }],
      });

      const result = await chatService.loadSystemMessage('user_123');

      expect(result).toBe('');
    });

    it('should handle database errors and return empty string', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await chatService.loadSystemMessage('user_123');

      expect(result).toBe('');
    });
  });

  describe('saveSystemMessage()', () => {
    it('should save system message using UPSERT', async () => {
      const userId = 'user_123';
      const message = 'You are a specialist';

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.saveSystemMessage(userId, message);

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [userId, message]
      );
    });

    it('should return success true on successful save', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.saveSystemMessage('user_123', 'message');

      expect(result).toEqual({ success: true });
    });

    it('should handle save errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Save failed'));

      const result = await chatService.saveSystemMessage('user_123', 'message');

      expect(result.success).toBe(false);
      expect((result as any).error).toBeDefined();
    });

    it('should work with empty message string', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.saveSystemMessage('user_123', '');

      expect(result.success).toBe(true);
    });
  });

  describe('loadConversations()', () => {
    it('should load all conversations for user', async () => {
      const userId = 'user_123';
      const conversations = [
        { id: 'conv_1', title: 'Chat 1', pinned: true, updated_at: new Date() },
        { id: 'conv_2', title: 'Chat 2', pinned: false, updated_at: new Date() },
      ];

      mockQuery.mockResolvedValueOnce({ rows: conversations });

      const result = await chatService.loadConversations(userId);

      expect(result).toEqual(conversations);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM chat_conversations WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC',
        [userId]
      );
    });

    it('should return empty array when no conversations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.loadConversations('user_new');

      expect(result).toEqual([]);
    });

    it('should handle database errors and return empty array', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await chatService.loadConversations('user_123');

      expect(result).toEqual([]);
    });

    it('should order by pinned DESC then updated_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await chatService.loadConversations('user_123');

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY pinned DESC, updated_at DESC');
    });
  });

  describe('pinConversation()', () => {
    it('should pin a conversation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.pinConversation('conv_123', true);

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE chat_conversations SET pinned = $1 WHERE id = $2',
        [true, 'conv_123']
      );
    });

    it('should unpin a conversation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.pinConversation('conv_456', false);

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.anything(),
        [false, 'conv_456']
      );
    });

    it('should handle pin errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Update failed'));

      const result = await chatService.pinConversation('conv_123', true);

      expect(result.success).toBe(false);
      expect((result as any).error).toBeDefined();
    });
  });

  describe('loadMessages()', () => {
    it('should load messages for conversation ordered by created_at ASC', async () => {
      const conversationId = 'conv_123';
      const messages = [
        { id: 'msg_1', role: 'user', content: 'Hello', created_at: new Date() },
        { id: 'msg_2', role: 'assistant', content: 'Hi', created_at: new Date() },
      ];

      mockQuery.mockResolvedValueOnce({ rows: messages });

      const result = await chatService.loadMessages(conversationId);

      expect(result).toEqual(messages);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );
    });

    it('should return empty array when no messages', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.loadMessages('conv_empty');

      expect(result).toEqual([]);
    });

    it('should handle errors and return empty array', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await chatService.loadMessages('conv_123');

      expect(result).toEqual([]);
    });
  });

  describe('createConversation()', () => {
    it('should create conversation and return its ID', async () => {
      const userId = 'user_123';
      const title = 'New Chat';

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'conv_new_123' }],
      });

      const result = await chatService.createConversation(userId, title);

      expect(result).toBe('conv_new_123');
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO chat_conversations (user_id, title) VALUES ($1, $2) RETURNING id',
        [userId, title]
      );
    });

    it('should return null when creation fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Insert failed'));

      const result = await chatService.createConversation('user_123', 'Chat');

      expect(result).toBeNull();
    });

    it('should return null when no ID returned', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.createConversation('user_123', 'Chat');

      expect(result).toBeNull();
    });
  });

  describe('saveMessage()', () => {
    it('should save message and update conversation timestamp', async () => {
      const conversationId = 'conv_123';
      const role = 'user';
      const content = 'Hello';

      // First call: INSERT message
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Second call: UPDATE conversation timestamp
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.saveMessage(conversationId, role, content);

      expect(result.success).toBe(true);
      // Should have made 2 queries
      expect(mockQuery).toHaveBeenCalledTimes(2);

      // Check both queries
      const firstCall = mockQuery.mock.calls[0];
      expect(firstCall[0]).toContain('INSERT INTO chat_messages');
      expect(firstCall[1]).toEqual([conversationId, role, content]);

      const secondCall = mockQuery.mock.calls[1];
      expect(secondCall[0]).toContain('UPDATE chat_conversations SET updated_at');
      expect(secondCall[1]).toEqual([conversationId]);
    });

    it('should save assistant message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.saveMessage(
        'conv_123',
        'assistant',
        'Response text'
      );

      expect(result.success).toBe(true);
    });

    it('should handle message save errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Insert failed'));

      const result = await chatService.saveMessage('conv_123', 'user', 'text');

      expect(result.success).toBe(false);
      expect((result as any).error).toBeDefined();
    });

    it('should handle update timestamp errors', async () => {
      // Insert succeeds
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Update fails
      mockQuery.mockRejectedValueOnce(new Error('Update failed'));

      const result = await chatService.saveMessage('conv_123', 'user', 'text');

      expect(result.success).toBe(false);
    });
  });

  describe('renameConversation()', () => {
    it('should rename conversation', async () => {
      const conversationId = 'conv_123';
      const newTitle = 'Renamed Chat';

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.renameConversation(conversationId, newTitle);

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE chat_conversations SET title = $1'),
        [newTitle, conversationId]
      );
    });

    it('should update timestamp when renaming', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await chatService.renameConversation('conv_123', 'New Name');

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('updated_at = NOW()');
    });

    it('should handle rename errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Update failed'));

      const result = await chatService.renameConversation('conv_123', 'New');

      expect(result.success).toBe(false);
      expect((result as any).error).toBeDefined();
    });
  });

  describe('deleteConversation()', () => {
    it('should delete a conversation', async () => {
      const conversationId = 'conv_to_delete';

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await chatService.deleteConversation(conversationId);

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM chat_conversations WHERE id = $1',
        [conversationId]
      );
    });

    it('should handle deletion errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Delete failed'));

      const result = await chatService.deleteConversation('conv_123');

      expect(result.success).toBe(false);
      expect((result as any).error).toBeDefined();
    });
  });
});
