'use server';

import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { ConversationSummary } from '@/app/services/memory/conversation-memory.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import pool from '@/app/clients/db';

const systemSettingsService = new SystemSettingsService();

async function resolveLLMConfig() {
    const settings = await systemSettingsService.loadAll();
    if (settings.google_api_key) {
        return {
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            apiKey: settings.google_api_key,
            model: 'gemini-2.5-flash',
        };
    }
    if (settings.github_token) {
        return {
            endpoint: 'https://models.inference.ai.azure.com/chat/completions',
            apiKey: settings.github_token,
            model: 'gpt-4o',
        };
    }
    throw new Error('No LLM API key configured. Please add a Google or GitHub key in Settings.');
}

export async function generateConversationSummary(conversationId: string, userId: string, _legacyToken?: string, domainSlug?: string | null) {
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig, domainSlug);
    return await memoryService.generateConversationSummary(conversationId, userId);
}

export async function getRecentSummaries(userId: string, _legacyToken?: string, limit?: number, minImportance?: number, domainSlug?: string | null) {
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig, domainSlug);
    return await memoryService.getRecentSummaries(userId, limit, minImportance);
}

export async function shouldSummarizeConversation(conversationId: string, _legacyToken?: string) {
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig);
    return await memoryService.shouldSummarizeConversation(conversationId);
}

export async function formatMemoryContext(summaries: ConversationSummary[], _legacyToken?: string) {
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig);
    return memoryService.formatMemoryContext(summaries);
}

export async function getSummaryStats(userId: string, _legacyToken?: string, domainSlug?: string | null) {
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig, domainSlug);
    return await memoryService.getSummaryStats(userId);
}

export async function deleteSummary(summaryId: string, _legacyToken?: string) {
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig);
    return await memoryService.deleteSummary(summaryId);
}

export async function saveCorrectionMemory(
    conversationId: string,
    userId: string,
    content: string,
    importance: number,
    emotion: number,
    domainSlug?: string | null
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
                  (user_id, conversation_id, summary, key_topics, importance_score, message_count, emotion, domain_slug)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    userId,
                    conversationId,
                    content,
                    ['preference', 'correction'],
                    importance,
                    1,
                    emotion,
                    domainSlug ?? null,
                ]
            );
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error saving correction:', error);
        return { success: false, error: error.message };
    }
}
