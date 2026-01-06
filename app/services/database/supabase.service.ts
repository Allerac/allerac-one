// Supabase service for chat operations (conversations, messages, settings)

import { SupabaseClient } from '@supabase/supabase-js';

export class ChatSupabaseService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Load system message from database (per user)
   */
  async loadSystemMessage(userId: string) {
    console.log('[loadSystemMessage] Starting with userId:', userId);
    
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('system_message')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('[loadSystemMessage] Error loading system message:', error);
      console.error('[loadSystemMessage] Error details:', JSON.stringify(error, null, 2));
      return '';
    }

    console.log('[loadSystemMessage] Loaded data:', data);
    return data?.system_message || '';
  }

  /**
   * Save system message to database (per user)
   */
  async saveSystemMessage(userId: string, systemMessage: string) {
    console.log('[saveSystemMessage] Starting with userId:', userId);
    console.log('[saveSystemMessage] System message:', systemMessage);
    
    const { error } = await this.supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        system_message: systemMessage,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('[saveSystemMessage] Error saving system message:', error);
      console.error('[saveSystemMessage] Error details:', JSON.stringify(error, null, 2));
      return { success: false, error };
    }

    console.log('[saveSystemMessage] Successfully saved');
    return { success: true };
  }

  /**
   * Load all conversations for a user
   */
  async loadConversations(userId: string) {
    const { data, error } = await this.supabase
      .from('chat_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error loading conversations:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Load messages for a conversation
   */
  async loadMessages(conversationId: string) {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading messages:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Create a new conversation
   */
  async createConversation(userId: string, title: string) {
    const { data, error } = await this.supabase
      .from('chat_conversations')
      .insert({
        user_id: userId,
        title: title,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }

    return data?.id || null;
  }

  /**
   * Save a message to a conversation
   */
  async saveMessage(conversationId: string, role: string, content: string) {
    const { error } = await this.supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        role: role,
        content: content,
      });

    if (error) {
      console.error('Error saving message:', error);
      return { success: false, error };
    }

    // Update conversation timestamp
    await this.supabase
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
    return { success: true };
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string) {
    const { error } = await this.supabase
      .from('chat_conversations')
      .delete()
      .eq('id', conversationId);

    if (error) {
      console.error('Error deleting conversation:', error);
      return { success: false, error };
    }

    return { success: true };
  }
}
