import pool from '@/app/clients/db';

export class ChatService {
    /**
     * Load system message from database (per user)
     */
    async loadSystemMessage(userId: string) {
        console.log('[DB] Starting with userId:', userId);

        try {
            const res = await pool.query(
                'SELECT system_message FROM user_settings WHERE user_id = $1',
                [userId]
            );

            if (res.rows.length === 0) return '';

            console.log('[DB] Loaded data');
            return res.rows[0].system_message || '';
        } catch (error) {
            console.error('[DB] Error loading system message:', error);
            return '';
        }
    }

    /**
     * Save system message to database (per user)
     */
    async saveSystemMessage(userId: string, systemMessage: string) {
        console.log('[DB] Starting with userId:', userId);

        try {
            await pool.query(
                `INSERT INTO user_settings (user_id, system_message, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET system_message = EXCLUDED.system_message, updated_at = NOW()`,
                [userId, systemMessage]
            );

            console.log('[DB] Successfully saved');
            return { success: true };
        } catch (error) {
            console.error('[DB] Error saving system message:', error);
            return { success: false, error };
        }
    }

    /**
     * Load all conversations for a user
     */
    async loadConversations(userId: string) {
        try {
            const res = await pool.query(
                'SELECT * FROM chat_conversations WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC',
                [userId]
            );
            return res.rows;
        } catch (error) {
            console.error('[DB] loadConversations failed:', error);
            return [];
        }
    }

    async pinConversation(conversationId: string, pinned: boolean) {
        try {
            await pool.query(
                'UPDATE chat_conversations SET pinned = $1 WHERE id = $2',
                [pinned, conversationId]
            );
            return { success: true };
        } catch (error) {
            console.error('[DB] pinConversation failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Load messages for a conversation
     */
    async loadMessages(conversationId: string) {
        try {
            const res = await pool.query(
                'SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
                [conversationId]
            );
            return res.rows;
        } catch (error) {
            console.error('[DB] loadMessages failed:', error);
            return [];
        }
    }

    /**
     * Create a new conversation
     */
    async createConversation(userId: string, title: string) {
        try {
            const res = await pool.query(
                'INSERT INTO chat_conversations (user_id, title) VALUES ($1, $2) RETURNING id',
                [userId, title]
            );
            return res.rows[0]?.id || null;
        } catch (error) {
            console.error('[DB] createConversation failed:', error);
            return null;
        }
    }

    /**
     * Save a message to a conversation
     */
    async saveMessage(conversationId: string, role: string, content: string) {
        try {
            await pool.query(
                'INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
                [conversationId, role, content]
            );

            // Update conversation timestamp
            await pool.query(
                'UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1',
                [conversationId]
            );

            return { success: true };
        } catch (error) {
            console.error('[DB] saveMessage failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Rename a conversation
     */
    async renameConversation(conversationId: string, title: string) {
        try {
            await pool.query(
                'UPDATE chat_conversations SET title = $1, updated_at = NOW() WHERE id = $2',
                [title, conversationId]
            );
            return { success: true };
        } catch (error) {
            console.error('[DB] renameConversation failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Delete a conversation and all its messages
     */
    async deleteConversation(conversationId: string) {
        try {
            await pool.query('DELETE FROM chat_conversations WHERE id = $1', [conversationId]);
            return { success: true };
        } catch (error) {
            console.error('[DB] deleteConversation failed:', error);
            return { success: false, error };
        }
    }
}
