'use server';

import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { ConversationSummary } from '@/app/services/memory/conversation-memory.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
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

export async function generateConversationSummary(conversationId: string, domainSlug?: string | null) {
    const user = await requireCurrentUser();
    if (domainSlug) await assertDomainAccess(user, domainSlug);
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig, domainSlug);
    return await memoryService.generateConversationSummary(conversationId, user.id);
}

export async function getRecentSummaries(limit?: number, minImportance?: number, domainSlug?: string | null) {
    const user = await requireCurrentUser();
    if (domainSlug) await assertDomainAccess(user, domainSlug);
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig, domainSlug);
    return await memoryService.getRecentSummaries(user.id, limit, minImportance);
}

export async function shouldSummarizeConversation(conversationId: string) {
    const user = await requireCurrentUser();
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig);
    return await memoryService.shouldSummarizeConversation(conversationId, user.id);
}

export async function formatMemoryContext(summaries: ConversationSummary[]) {
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig);
    return memoryService.formatMemoryContext(summaries);
}

export async function getSummaryStats(domainSlug?: string | null) {
    const user = await requireCurrentUser();
    if (domainSlug) await assertDomainAccess(user, domainSlug);
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig, domainSlug);
    return await memoryService.getSummaryStats(user.id);
}

export async function deleteSummary(summaryId: string) {
    const user = await requireCurrentUser();
    const llmConfig = await resolveLLMConfig();
    const memoryService = new ConversationMemoryService(llmConfig);
    return await memoryService.deleteSummary(summaryId, user.id);
}

export async function saveCorrectionMemory(
    conversationId: string,
    content: string,
    importance: number,
    emotion: number,
    domainSlug?: string | null
) {
    try {
        const user = await requireCurrentUser();
        if (domainSlug) await assertDomainAccess(user, domainSlug);
        const res = await pool.query(
            `SELECT cs.id, cs.summary
             FROM conversation_summaries cs
             INNER JOIN chat_conversations cc ON cc.id = cs.conversation_id
             WHERE cs.conversation_id = $1 AND cs.user_id = $2 AND cc.user_id = $2`,
            [conversationId, user.id]
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
                  WHERE id = $4 AND user_id = $5`,
                [updatedSummary, importance, emotion, existing.id, user.id]
            );
        } else {
            const conversation = await pool.query(
                'SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2',
                [conversationId, user.id]
            );
            if (!conversation.rows[0]) {
                return { success: false, error: 'Conversation not found' };
            }
            await pool.query(
                `INSERT INTO conversation_summaries
                  (user_id, conversation_id, summary, key_topics, importance_score, message_count, emotion, domain_slug)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    user.id,
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
    } catch (error: unknown) {
        console.error('Error saving correction:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save correction' };
    }
}
