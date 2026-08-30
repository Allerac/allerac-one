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
import { PUBLIC_DOMAINS } from '@/app/services/chat/chat-tool-registry';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { domainRateLimitSettingsService } from '@/app/services/domains/domain-rate-limit-settings.service';

const chatService = new ChatService();
const userSettingsService = new UserSettingsService();

// Anonymous website visitors share one service account per public domain — cap how
// long a single conversation can run so no visitor can turn one thread into an
// unbounded, ever-growing (and ever more expensive) context. See
// docs/domains/expose-agent-to-website.md.
const PUBLIC_DOMAIN_MAX_MESSAGES_PER_CONVERSATION = 40;

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
  let publicLimitResult: ReturnType<typeof acquireOperationLimit> | null = null;
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

    const isPublicDomain = PUBLIC_DOMAINS.includes(domain);

    if (isPublicDomain) {
      const existingCount = await chatService.countMessages(id);
      if (existingCount >= PUBLIC_DOMAIN_MAX_MESSAGES_PER_CONVERSATION) {
        return apiError(
          'conversation_limit_reached',
          'This conversation has reached its message limit. Please start a new conversation.',
          403,
        );
      }
    }

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

    // Extra daily volume cap for public domains — every anonymous visitor shares this
    // one service account, so 'chat's per-minute window alone doesn't stop sustained
    // abuse (VPN/IP rotation) from running up real LLM spend over a day.
    let domainRateLimitSettings: Awaited<ReturnType<typeof domainRateLimitSettingsService.get>> | null = null;
    if (isPublicDomain) {
      domainRateLimitSettings = await domainRateLimitSettingsService.get(domain);
      const override = domainRateLimitSettingsService.toOverride(domainRateLimitSettings);
      publicLimitResult = acquireOperationLimit('public-chat', user.id, Date.now(), override);
      if (!publicLimitResult.allowed) {
        // `finally` below releases the already-acquired 'chat' lease.
        return Response.json(
          {
            error: {
              code: 'rate_limited',
              message: 'Daily chat volume limit exceeded for this domain',
              details: { retryAfterSeconds: publicLimitResult.retryAfterSeconds },
            },
          },
          { status: 429, headers: publicLimitResult.headers },
        );
      }

      // Fire-and-forget: never let alert delivery affect the chat response.
      const usage = domainRateLimitSettingsService.usageFromSettings(domainRateLimitSettings, user.id);
      void domainRateLimitSettingsService.checkAndAlert(domain, usage, domainRateLimitSettings);
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
    // API-key callers (e.g. the CLI) send no session cookies at all, so the
    // locale cookie is never present for them — fall back to the account's
    // saved language (user_settings.language, set via the Hub's language
    // picker) before defaulting to English, so non-browser clients still get
    // the right language instead of silently always landing on 'en'.
    const cookieLocale = cookieStore.get('locale')?.value;
    let rawLocale = parsed.data.locale || cookieLocale;
    if (!rawLocale) {
      const settings = await userSettingsService.loadUserSettings(user.id);
      rawLocale = settings?.language || 'en';
    }
    // prompt-builder.ts only recognizes bare 2-letter codes (LANGUAGE_NAMES) — strip any
    // region suffix (e.g. the website's 'pt-BR' -> 'pt') or the language instruction silently
    // falls back to English.
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
    if (publicLimitResult?.allowed) {
      publicLimitResult.lease.release();
    }
  }
}
