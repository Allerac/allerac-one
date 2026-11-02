/**
 * /api/chat — SSE streaming chat Route Handler
 *
 * Handles the full AI pipeline server-side so Cloudflare sees a 200 + text/event-stream
 * immediately (<1 ms), eliminating 524 timeouts regardless of model speed.
 *
 * SSE event protocol:
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"tool_call","name":"...","args":{...}}
 *   data: {"type":"tool_result","name":"...","success":true}
 *   data: {"type":"done","conversationId":"..."}
 *   data: {"type":"error","message":"..."}
 */

import { acquireConversationLock, getOrCreatePrimaryConversation, loadPrimaryPromptHistory, scheduleCompaction } from '@/app/services/chat/primary-conversation';
import { makeSegmentSummarizer } from '@/app/services/chat/segment-summarizer';
import { memoryReadDomain } from '@/app/services/memory/memory-scope';
import { cookies } from 'next/headers';
import {
  authenticationErrorResponse,
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { ChatService } from '@/app/services/database/chat.service';
import { loadChatKnowledgeContext } from '@/app/services/knowledge/chat-knowledge-context';
import { skillsService } from '@/app/services/skills/skills.service';
import {
  InvalidChatRequestError,
  parseChatRequestBody,
} from '@/app/services/chat/chat-request-parser';
import {
  encodeSseEvent as encode,
  SSE_RESPONSE_HEADERS,
  SseWriter,
} from '@/app/services/chat/sse-writer';
import { buildChatSystemPrompt } from '@/app/services/chat/prompt-builder';
import { PUBLIC_DOMAINS, canUseFederationTools, resolveChatTools } from '@/app/services/chat/chat-tool-registry';
import { hasActivePeers, listActivePeerLabels } from '@/federation/peer-presence';
import { loadChatSoulIdentity } from '@/federation/unit-profile.repository';
import { isShellAllowedFor } from '@/app/lib/shell-access';
import { resolveActiveChatSkill } from '@/app/services/chat/chat-skill-resolver';
import { runChatPipeline } from '@/app/services/chat/chat-pipeline';
import {
  ChatProviderConfigurationError,
  loadChatRuntimeContext,
} from '@/app/services/chat/chat-runtime-context';
import { processChatImages } from '@/app/services/chat/chat-image-processor';
import {
  acquireOperationLimit,
  operationLimitResponse,
} from '@/app/lib/operation-limiter';
import { domainModelSettingsService } from '@/app/services/domains/domain-model-settings.service';

const chatService = new ChatService();
export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  let body;
  try {
    body = parseChatRequestBody(await request.json());
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Invalid JSON' : 'Invalid chat request';
    const status = error instanceof SyntaxError || error instanceof InvalidChatRequestError ? 400 : 500;
    return Response.json({ error: message }, { status });
  }

  const {
    message,
    conversationId: requestedConversationId,
    model: modelId,
    provider,
    imageAttachments,
    preSelectedSkillId,
    defaultSkillName,
    domain: effectiveDomain,
    postContext,
    surface,
  } = body;
  let inputConversationId = requestedConversationId;

  try {
    await assertDomainAccess(user, effectiveDomain);
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Failed to verify domain access' }, { status: 500 });
  }

  let resolvedModel;
  try {
    resolvedModel = await domainModelSettingsService.resolve({
      userId: user.id,
      domainSlug: effectiveDomain,
      globalModelId: modelId,
      globalProvider: provider,
    });
  } catch (error) {
    console.error('[ChatRoute] Failed to resolve domain model:', error);
    return Response.json({ error: 'Failed to resolve domain model' }, { status: 500 });
  }

  const userId = user.id;

  // Phase 4b: in the agent chat only the primary conversation is writable;
  // older conversations are a read-only archive. Other surfaces (domain
  // panels, /code, /tickets, federation) are not affected by this rule.
  if (surface === 'agent') {
    try {
      if (!inputConversationId) {
        inputConversationId = await getOrCreatePrimaryConversation({ userId, domain: effectiveDomain });
      } else {
        const target = await chatService.getConversationForUser(inputConversationId, userId);
        if (target && target.is_primary !== true) {
          return Response.json({ error: 'This conversation is archived and read-only' }, { status: 409 });
        }
      }
    } catch (error) {
      console.error('[ChatRoute] Failed to resolve the primary conversation:', error);
      return Response.json({ error: 'Failed to open the conversation' }, { status: 500 });
    }
  }

  const limitResult = acquireOperationLimit('chat', userId);
  if (!limitResult.allowed) {
    return operationLimitResponse(limitResult);
  }

  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value || 'en';

  const stream = new ReadableStream({
    async start(controller) {
      const writer = new SseWriter(controller, request.signal);
      writer.keepalive();
      const safeEnqueue = (data: Uint8Array) => writer.write(data);
      let releaseLock: (() => Promise<void>) | null = null;

      try {
        // Log domain entry — visible in System Monitor
        const providerLabel = resolvedModel.provider === 'ollama'
          ? `● LOCAL · ${resolvedModel.modelId}`
          : `◌ ${resolvedModel.provider} · ${resolvedModel.modelId}`;
        console.log(`[ChatRoute] ► ${effectiveDomain} — ${providerLabel}`);

        const processedImages = await processChatImages(imageAttachments);
        let runtimeContext;
        try {
          runtimeContext = await loadChatRuntimeContext(userId, effectiveDomain, resolvedModel.provider);
        } catch (error) {
          if (error instanceof ChatProviderConfigurationError) {
            writer.event({ type: 'error', message: error.message });
            writer.close();
            return;
          }
          throw error;
        }
        const {
          githubToken,
          tavilyApiKey,
          googleApiKey,
          anthropicApiKey,
          openaiApiKey,
          userLocation,
          userInstructions,
          modelBaseUrl,
          timezone,
        } = runtimeContext;

        // 4. Create or find conversation
        let convId = inputConversationId ?? null;
        let isPrimary = false;
        if (!convId) {
          const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          convId = await chatService.createConversation(userId, title, effectiveDomain);
          if (!convId) throw new Error('Failed to create conversation');
        } else {
          const conversation = await chatService.getConversationForUser(convId, userId);
          if (!conversation) {
            safeEnqueue(encode({ type: 'error', message: 'Conversation not found' }));
            writer.close();
            return;
          }
          if (conversation.domain_slug !== effectiveDomain) {
            safeEnqueue(encode({ type: 'error', message: 'Conversation not found' }));
            writer.close();
            return;
          }
          isPrimary = conversation.is_primary === true;
        }
        // Phase 4a: serialize writes to the primary conversation across channels.
        if (isPrimary) releaseLock = await acquireConversationLock(convId);

        const activeSkill = await resolveActiveChatSkill({
          conversationId: convId,
          domain: effectiveDomain,
          userId,
          message,
          isNewConversation: !inputConversationId,
          preSelectedSkillId,
          defaultSkillName,
          emit: (event) => safeEnqueue(encode(event)),
        });

        // 6. Build final message with image URLs
        let finalMessage = message;
        if (processedImages && processedImages.length > 0) {
          const imageUrls = processedImages.map(img => img.url);
          finalMessage += `\n\n[Image URLs: ${imageUrls.join(', ')}]`;
        }

        // 7. Save user message
        const messageToSave = processedImages && processedImages.length > 0
          ? `${finalMessage} [Image attached: ${processedImages.length} file(s)]`
          : message;
        const savedUserMessage = await chatService.saveMessage(convId, 'user', messageToSave, { userId });
        if (!savedUserMessage.success) throw new Error('Failed to save user message');

        // 8. Load RAG context (domain-scoped)
        let relevantContext = '';
        try {
          relevantContext = await loadChatKnowledgeContext({
            userId,
            isAdmin: user.is_admin === true,
            query: message,
            // The chat agent has one memory: reads are not filtered by domain.
            domainSlug: memoryReadDomain(effectiveDomain),
            publicDomain: PUBLIC_DOMAINS.includes(effectiveDomain),
          });
        } catch (e) {
          console.log('[ChatRoute] RAG search failed:', e);
        }

        // 9. Build enriched system message
        let skillContent = '';
        if (activeSkill) {
          try {
            skillContent = await skillsService.getEnrichedSkillContent(activeSkill.id, userId, message);
            console.log(`[ChatRoute] Loaded skill: ${activeSkill.name}`);
          } catch (e) {
            console.error('[ChatRoute] Skill content failed:', e);
          }
        }

        const federationOffered = canUseFederationTools({
          isAdmin: user.is_admin === true,
          domain: effectiveDomain,
        }) && await hasActivePeers();

        const enrichedSystemMessage = buildChatSystemPrompt({
          user,
          locale,
          domain: effectiveDomain,
          userLocation,
          timezone,
          tavilyConfigured: Boolean(tavilyApiKey),
          userInstructions,
          postContext,
          activeSkill,
          skillContent,
          relevantContext,
          unitIdentity: await loadChatSoulIdentity(effectiveDomain, federationOffered, listActivePeerLabels),
        });

        const activeTools = await resolveChatTools(activeSkill?.id, effectiveDomain, {
          allowShell: isShellAllowedFor(user),
          allowFederation: federationOffered,
        });

        // Load conversation history and build messages array. Primary
        // conversations use the bounded window (segments + recent messages);
        // the just-saved user message is appended below, so drop it here.
        let history: Array<{ role: string; content: string }>;
        if (isPrimary) {
          history = await loadPrimaryPromptHistory(convId);
          const last = history[history.length - 1];
          if (last?.role === 'user' && last.content === messageToSave) history.pop();
        } else {
          history = await chatService.loadMessages(convId, userId);
        }
        const conversationMessages: Array<{
          role: string;
          content: string | any[];
          tool_call_id?: string;
          tool_calls?: any;
        }> = [
          { role: 'system', content: enrichedSystemMessage },
          ...history.map((m: any) => ({ role: m.role, content: m.content })),
        ];

        // Append the new user message (with multimodal content if images provided)
        if (processedImages && processedImages.length > 0) {
          const contentParts: any[] = [{ type: 'text', text: message }];

          // Add image URLs to the message so LLM knows them
          const imageUrls = processedImages.map(img => img.url);
          if (imageUrls.length > 0) {
            contentParts[0].text += `\n\n[Image URLs for reference: ${imageUrls.join(', ')}]`;
          }

          for (const img of processedImages) {
            contentParts.push({ type: 'image_url', image_url: { url: img.url } });
          }
          conversationMessages.push({ role: 'user', content: contentParts });
        } else {
          // Text-only message
          conversationMessages.push({ role: 'user', content: message });
        }

        const fullContent = await runChatPipeline({
          provider: resolvedModel.provider,
          modelBaseUrl,
          modelId: resolvedModel.modelId,
          temperature: resolvedModel.temperature,
          maxTokens: resolvedModel.maxTokens,
          fallbackModelId: resolvedModel.fallbackModelId,
          githubToken,
          googleApiKey,
          anthropicApiKey,
          openaiApiKey,
          tavilyApiKey,
          user,
          domain: effectiveDomain,
          conversationId: convId,
          message,
          locale,
          activeSkill,
          activeTools,
          messages: conversationMessages,
          emit: (event) => safeEnqueue(encode(event)),
          keepalive: () => writer.keepalive(),
          timeZone: timezone,
        });

        // 13. Save assistant message to DB
        const savedAssistantMessage = await chatService.saveMessage(convId, 'assistant', fullContent, { userId });
        if (!savedAssistantMessage.success) throw new Error('Failed to save assistant message');

        // Track skill usage
        if (activeSkill) {
          try {
            await skillsService.completeSkillUsage(convId, true, undefined, 0);
          } catch (e) {
            console.error('[ChatRoute] Skill usage tracking failed:', e);
          }
        }

        if (releaseLock) { await releaseLock(); releaseLock = null; }
        if (isPrimary) {
          scheduleCompaction(convId, makeSegmentSummarizer({
            provider: resolvedModel.provider,
            baseUrl: modelBaseUrl,
            modelId: resolvedModel.modelId,
            githubToken,
            geminiToken: googleApiKey,
            anthropicToken: anthropicApiKey,
            openaiToken: openaiApiKey,
          }));
        }

        // 14. Signal completion
        safeEnqueue(encode({ type: 'done', conversationId: convId }));
        writer.close();
      } catch (error: any) {
        console.error('[ChatRoute] Caught error:', {
          message: error.message,
          code: error.code,
          stack: error.stack,
        });
        try {
          safeEnqueue(encode({ type: 'error', message: error.message || 'Internal server error' }));
          writer.close();
        } catch (closeError: any) {
          console.error('[ChatRoute] Failed to send error event (controller already closed):', closeError.message);
        }
      } finally {
        if (releaseLock) await releaseLock().catch(() => undefined);
        limitResult.lease.release();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...SSE_RESPONSE_HEADERS,
      ...limitResult.headers,
    },
  });
}
