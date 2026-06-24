import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import {
  ConversationMemoryService,
  type ConversationSummary,
} from '@/app/services/memory/conversation-memory.service';

const systemSettingsService = new SystemSettingsService();
const readOnlyMemoryConfig = { endpoint: 'about:blank', apiKey: '', model: 'read-only' };

export async function resolveMemoryLlmConfig() {
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

  return null;
}

export function createMemoryReadService(domainSlug?: string | null) {
  return new ConversationMemoryService(readOnlyMemoryConfig, domainSlug);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function memoryDto(memory: ConversationSummary) {
  return {
    id: memory.id,
    conversationId: memory.conversation_id,
    userId: memory.user_id,
    summary: memory.summary,
    keyTopics: memory.key_topics ?? [],
    importanceScore: memory.importance_score,
    messageCount: memory.message_count,
    domainSlug: memory.domain_slug ?? null,
    emotion: memory.emotion ?? null,
    createdAt: iso(memory.created_at),
  };
}
