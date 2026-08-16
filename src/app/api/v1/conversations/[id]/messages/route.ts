import { cookies } from 'next/headers';
import { z } from 'zod';
import { ChatService } from '@/app/services/database/chat.service';
import { assertDomainAccess } from '@/app/lib/auth-session';
import { requireApiUser } from '../../../_lib/auth';
import { messageDto } from '../../../_lib/conversations';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { CHAT_PROVIDERS } from '@/app/services/chat/chat-request-parser';
import {
  ChatConversationNotFoundError,
  ChatMessagePersistenceError,
  executeChatMessage,
} from '@/app/services/chat/chat-execution.service';
import { ChatProviderConfigurationError } from '@/app/services/chat/chat-runtime-context';
import { acquireOperationLimit } from '@/app/lib/operation-limiter';
import { domainModelSettingsService } from '@/app/services/domains/domain-model-settings.service';

const chatService = new ChatService();

const sendMessageSchema = z.object({
  message: z.string().max(100_000).optional(),
  // Optional: omit to use the domain's configured model (see
  // domainModelSettingsService.resolveDomainDefault below) instead of naming one explicitly.
  model: z.string().trim().min(1).max(200).optional(),
  provider: z.enum(CHAT_PROVIDERS).optional(),
  imageAttachments: z.array(z.object({
    url: z.string().max(8 * 1024 * 1024).refine(
      value => value.startsWith('data:image/') || value.startsWith('https://'),
      'Image attachments must be data:image or https URLs',
    ),
  })).max(5).optional(),
  preSelectedSkillId: z.string().uuid().optional(),
  defaultSkillName: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/).optional(),
  postContext: z.string().max(20_000).optional(),
  // Server-to-server callers (e.g. the website's Worker) have no browser session/cookie to read
  // locale from — let them state it explicitly. Falls back to the locale cookie, then 'en'.
  locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
}).refine(
  value => Boolean(value.message?.trim()) || Boolean(value.imageAttachments?.length),
  { message: 'Message or imageAttachments is required', path: ['message'] },
);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireApiUser('chat:read', request);
    const { id } = await context.params;

    const conversation = await chatService.getConversationForUser(id, user.id);
    if (!conversation) {
      return apiError('not_found', 'Conversation not found', 404);
    }

    const messages = await chatService.loadMessages(id, user.id);
    return apiData({ messages: messages.map(messageDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/conversations/:id/messages failed', error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  let limitResult: ReturnType<typeof acquireOperationLimit> | null = null;
  try {
    const user = await requireApiUser('chat:write', request);
    const { id } = await context.params;
    const parsed = sendMessageSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid message payload', 400, parsed.error.flatten());
    }

    const conversation = await chatService.getConversationForUser(id, user.id);
    if (!conversation) {
      return apiError('not_found', 'Conversation not found', 404);
    }

    const domain = conversation.domain_slug ?? 'chat';
    await assertDomainAccess({
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: user.isAdmin,
      created_at: new Date(),
    }, domain);

    limitResult = acquireOperationLimit('chat', user.id);
    if (!limitResult.allowed) {
      const code = limitResult.reason === 'concurrency' ? 'concurrency_limited' : 'rate_limited';
      const message = limitResult.reason === 'concurrency'
        ? 'Too many concurrent chat operations'
        : 'Chat rate limit exceeded';
      return Response.json(
        {
          error: {
            code,
            message,
            details: { retryAfterSeconds: limitResult.retryAfterSeconds },
          },
        },
        { status: 429, headers: limitResult.headers },
      );
    }

    let modelId = parsed.data.model;
    let provider = parsed.data.provider;
    if (!modelId || !provider) {
      const domainDefault = await domainModelSettingsService.resolveDomainDefault(user.id, domain);
      if (!domainDefault) {
        return apiError(
          'provider_not_configured',
          `No model is configured for domain "${domain}" and no model/provider was provided`,
          422,
        );
      }
      modelId = domainDefault.modelId;
      provider = domainDefault.provider;
    }

    const cookieStore = await cookies();
    // prompt-builder.ts only recognizes bare 2-letter codes (LANGUAGE_NAMES) — strip any
    // region suffix (e.g. the website's 'pt-BR' -> 'pt') or the language instruction silently
    // falls back to English.
    const rawLocale = parsed.data.locale || cookieStore.get('locale')?.value || 'en';
    const locale = rawLocale.split('-')[0];
    const events: Array<Record<string, any>> = [];
    const result = await executeChatMessage({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: user.isAdmin,
        created_at: new Date(),
      },
      conversationId: id,
      domain,
      message: parsed.data.message || 'What do you see in this image?',
      modelId,
      provider,
      locale,
      imageAttachments: parsed.data.imageAttachments,
      preSelectedSkillId: parsed.data.preSelectedSkillId,
      defaultSkillName: parsed.data.defaultSkillName,
      postContext: parsed.data.postContext,
      emit: event => events.push(event),
    });

    return apiData({
      message: {
        conversationId: result.conversationId,
        role: 'assistant',
        content: result.content,
      },
      events,
    }, { status: 201, headers: limitResult.headers });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    if (error instanceof ChatConversationNotFoundError) {
      return apiError('not_found', 'Conversation not found', 404);
    }
    if (error instanceof ChatProviderConfigurationError) {
      return apiError('provider_not_configured', error.message, 422);
    }
    if (error instanceof ChatMessagePersistenceError) {
      return apiError('message_persistence_failed', error.message, 500);
    }
    return apiInternalError('POST /api/v1/conversations/:id/messages failed', error);
  } finally {
    if (limitResult?.allowed) {
      limitResult.lease.release();
    }
  }
}
