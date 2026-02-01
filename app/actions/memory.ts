'use server';

import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { ConversationSummary } from '@/app/services/memory/conversation-memory.service';
import pool from '@/app/clients/db';

export async function generateConversationSummary(conversationId: string, userId: string, githubToken: string) {
    const memoryService = new ConversationMemoryService(githubToken);
    return await memoryService.generateConversationSummary(conversationId, userId);
}

export async function getRecentSummaries(userId: string, githubToken: string, limit?: number, minImportance?: number) {
    const memoryService = new ConversationMemoryService(githubToken);
    return await memoryService.getRecentSummaries(userId, limit, minImportance);
}

export async function shouldSummarizeConversation(conversationId: string, githubToken: string) {
    const memoryService = new ConversationMemoryService(githubToken);
    return await memoryService.shouldSummarizeConversation(conversationId);
}

export async function formatMemoryContext(summaries: ConversationSummary[], githubToken: string) {
    const memoryService = new ConversationMemoryService(githubToken);
    return memoryService.formatMemoryContext(summaries);
}

export async function getSummaryStats(userId: string, githubToken: string) {
    const memoryService = new ConversationMemoryService(githubToken);
    return await memoryService.getSummaryStats(userId);
}

export async function deleteSummary(summaryId: string, githubToken: string) {
    const memoryService = new ConversationMemoryService(githubToken);
    return await memoryService.deleteSummary(summaryId);
}

export async function saveCorrectionMemory(
    conversationId: string,
    userId: string,
    content: string,
    importance: number,
    emotion: number
) {
    try {
        const res = await pool.query(
            'SELECT id, summary FROM conversation_summaries WHERE conversation_id = $1',
            [conversationId]
        );

        const existing = res.rows[0];

        if (existing) {
            const updatedSummary = `${existing.summary}\n\n${content}`;
            await pool.query(
                `UPDATE conversation_summaries 
                  SET summary = $1, 
                      key_topics = array_cat(key_topics, ARRAY['preference', 'correction']),
                      importance_score = $2,
                      emotion = $3
                  WHERE id = $4`,
                [updatedSummary, importance, emotion, existing.id]
            );
        } else {
            await pool.query(
                `INSERT INTO conversation_summaries 
                  (user_id, conversation_id, summary, key_topics, importance_score, message_count, emotion)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    userId,
                    conversationId,
                    content,
                    ['preference', 'correction'],
                    importance,
                    1,
                    emotion
                ]
            );
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error saving correction:', error);
        return { success: false, error: error.message };
    }
}
