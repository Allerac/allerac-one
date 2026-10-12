import { domainService } from '@/app/services/domains/domain.service';
import { domainModelSettingsService } from '@/app/services/domains/domain-model-settings.service';
import { ChatService } from '@/app/services/database/chat.service';
import { executeChatMessage } from '@/app/services/chat/chat-execution.service';
import { MODELS } from '@/app/services/llm/models';
import type { ChatProvider } from '@/app/services/chat/chat-request-parser';

const chatService = new ChatService();

export interface DomainTestChatEvent {
  type: string;
  name?: string;
  args?: unknown;
  data?: unknown;
  success?: boolean;
  [key: string]: unknown;
}

export interface DomainTestChatResult {
  conversationId: string;
  content: string;
  events: DomainTestChatEvent[];
}

/**
 * Runs a message through the exact same pipeline a real visitor's message
 * would go through (same skill, tools, model resolution), but:
 *  - acts as the domain's own bot account, not the admin viewing this screen
 *    (same "resolve to the real owner" fix as the model picker/dashboard);
 *  - skips the public rate limiter and Telegram alerting entirely — this
 *    never goes through messages/route.ts's HTTP layer, so acquireOperationLimit
 *    is never called for it;
 *  - surfaces the raw tool_call/tool_result events, which the real widget
 *    never shows a visitor, specifically so this doubles as the tool-call
 *    debugging view (e.g. spotting a model that fakes tool_calls as text).
 *
 * Test messages still flow through the real LLM call and get counted in
 * tokens_usage like any other request — deliberately not filtered out of the
 * BOTS dashboard, to keep this simple (see conversation decision 2026-08-30).
 */
export async function sendDomainTestMessage(input: {
  domainSlug: string;
  message: string;
  conversationId?: string | null;
  modelId?: string | null;
  locale?: string;
}): Promise<DomainTestChatResult> {
  const owner = await domainService.findDomainOwner(input.domainSlug);
  if (!owner) {
    throw new Error(`No bot account is provisioned for domain "${input.domainSlug}" yet`);
  }

  let modelId = input.modelId;
  let provider: ChatProvider | undefined;
  if (modelId) {
    const model = MODELS.find(m => m.id === modelId);
    if (!model) throw new Error(`Unknown model "${modelId}"`);
    provider = model.provider as ChatProvider;
  } else {
    const domainDefault = await domainModelSettingsService.resolveDomainDefault(owner.id, input.domainSlug);
    if (!domainDefault) {
      throw new Error(`No model is configured for domain "${input.domainSlug}" — set one first`);
    }
    modelId = domainDefault.modelId;
    provider = domainDefault.provider as ChatProvider;
  }

  const conversationId = input.conversationId
    || await chatService.createConversation(owner.id, `Test — ${input.domainSlug}`, input.domainSlug);
  if (!conversationId) {
    throw new Error('Failed to create a test conversation');
  }

  const events: DomainTestChatEvent[] = [];
  const result = await executeChatMessage({
    user: { id: owner.id, email: owner.email, name: null, is_admin: false, created_at: new Date() },
    conversationId,
    domain: input.domainSlug,
    message: input.message,
    modelId,
    provider: provider!,
    locale: input.locale ?? 'pt',
    emit: (event) => events.push(event as DomainTestChatEvent),
  });

  const finalEvents = (result.events.length ? result.events : events) as DomainTestChatEvent[];
  return { conversationId: result.conversationId, content: result.content, events: finalEvents };
}
