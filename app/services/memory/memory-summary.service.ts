import { SupabaseClient } from '@supabase/supabase-js';
import { Message, MemorySaveResult } from '../../types';

export class MemorySummaryService {
  constructor(
    private supabase: SupabaseClient,
    private githubToken: string
  ) {}

  async generateAndSaveSummary(
    conversationId: string,
    userId: string,
    messages: Message[]
  ): Promise<MemorySaveResult> {
    // Validation: Check required parameters
    if (!conversationId || !userId || !this.githubToken) {
      return {
        success: false,
        message: 'No active conversation to save'
      };
    }

    // Validation: Check minimum message count
    if (messages.length < 2) {
      return {
        success: false,
        message: 'Add at least 2 messages before saving to memory'
      };
    }

    try {
      // Check if summary already exists
      const { data: existingSummary } = await this.supabase
        .from('conversation_summaries')
        .select('id')
        .eq('conversation_id', conversationId)
        .single();

      if (existingSummary) {
        return {
          success: false,
          message: 'This conversation is already saved in memory. View it in the Memories section.'
        };
      }

      // Generate summary using ConversationMemoryService
      const { ConversationMemoryService } = await import('@/app/services/memory/conversation-memory.service');
      const memoryService = new ConversationMemoryService(this.supabase, this.githubToken);
      
      const summary = await memoryService.generateConversationSummary(conversationId, userId);
      
      if (summary) {
        return {
          success: true,
          message: 'Successfully saved to memory!',
          summary: summary.summary,
          importance: summary.importance_score,
          topics: summary.key_topics
        };
      }

      return {
        success: false,
        message: 'Failed to generate summary'
      };
    } catch (error) {
      console.error('Error saving to memory:', error);
      return {
        success: false,
        message: 'Failed to save: ' + (error as Error).message
      };
    }
  }
}
