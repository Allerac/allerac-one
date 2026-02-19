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

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { LLMService } from '@/app/services/llm/llm.service';
import { ChatService } from '@/app/services/database/chat.service';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { SearchWebTool } from '@/app/tools/search-web.tool';
import { ShellTool } from '@/app/tools/shell.tool';
import { skillsService } from '@/app/services/skills/skills.service';
import { TOOLS } from '@/app/tools/tools';

const authService = new AuthService();
const userSettingsService = new UserSettingsService();
const chatService = new ChatService();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';

function encode(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  // Parse request body and cookies BEFORE creating the stream
  // (request.json() can only be called once, and must happen before the response is sent)
  const body = await request.json();
  const {
    message,
    conversationId: inputConversationId,
    model: modelId,
    provider,
    imageAttachments,
    preSelectedSkillId,
  }: {
    message: string;
    conversationId: string | null;
    model: string;
    provider: 'github' | 'ollama';
    imageAttachments?: Array<{ url: string }>;
    preSelectedSkillId?: string;
  } = body;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;

  const stream = new ReadableStream({
    async start(controller) {
      // Enqueue immediately so Next.js flushes the 200 + text/event-stream headers
      // before any async work. Without this, Cloudflare waits for the first byte
      // and issues a 524 if the LLM or DB takes more than ~100 s.
      controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));

      try {
        // 1. Authenticate via session cookie
        if (!sessionToken) {
          controller.enqueue(encode({ type: 'error', message: 'Unauthorized' }));
          controller.close();
          return;
        }

        const user = await authService.validateSession(sessionToken);
        if (!user) {
          controller.enqueue(encode({ type: 'error', message: 'Unauthorized' }));
          controller.close();
          return;
        }

        const userId = user.id;

        // 2. Load user settings (API keys stay server-side)
        const settings = await userSettingsService.loadUserSettings(userId);
        const githubToken = settings?.github_token || '';
        const tavilyApiKey = settings?.tavily_api_key || undefined;
        const systemMessage = settings?.system_message || 'You are a helpful AI assistant.';

        if (!message && (!imageAttachments || imageAttachments.length === 0)) {
          controller.enqueue(encode({ type: 'error', message: 'Message is required' }));
          controller.close();
          return;
        }

        // Server-side base URL (never goes through client-side proxy)
        const modelBaseUrl = provider === 'ollama' ? OLLAMA_BASE_URL : GITHUB_BASE_URL;

        // 4. Create or find conversation
        let convId = inputConversationId ?? null;
        if (!convId) {
          const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          convId = await chatService.createConversation(userId, title);
          if (!convId) throw new Error('Failed to create conversation');
        }

        // 5. Load active skill; for new conversations prefer pre-selected, then default
        let activeSkill = await skillsService.getActiveSkill(convId);

        if (!activeSkill && !inputConversationId) {
          // Client explicitly selected a skill before sending the first message
          if (preSelectedSkillId) {
            const preSelected = await skillsService.getSkillById(preSelectedSkillId);
            if (preSelected) {
              await skillsService.activateSkill(preSelected.id, convId, userId, 'manual', 'Pre-selected by user');
              activeSkill = preSelected;
              console.log(`[ChatRoute] Activated pre-selected skill: ${preSelected.name}`);
            }
          }

          // Fall back to the user's default skill
          if (!activeSkill) {
            const defaultSkill = await skillsService.getDefaultUserSkill(userId);
            if (defaultSkill) {
              await skillsService.activateSkill(defaultSkill.id, convId, userId, 'auto', 'Default skill activated');
              activeSkill = defaultSkill;
              console.log(`[ChatRoute] Activated default skill: ${defaultSkill.name}`);
            }
          }
        }

        // Auto-switch skills based on message content
        if (activeSkill) {
          const availableSkills = await skillsService.getUserSkills(userId);
          for (const skill of availableSkills) {
            if (skill.id !== activeSkill.id && skill.auto_switch_rules) {
              const shouldSwitch = await skillsService.shouldAutoActivate(skill, {
                message,
                conversationHistory: await chatService.loadMessages(convId),
              });
              if (shouldSwitch) {
                await skillsService.activateSkill(skill.id, convId, userId, 'auto', message);
                activeSkill = skill;
                console.log(`[ChatRoute] Auto-switched to skill: ${skill.name}`);
                break;
              }
            }
          }
        }

        // 6. Save user message
        const messageToSave = imageAttachments && imageAttachments.length > 0
          ? `${message} [Image attached: ${imageAttachments.length} file(s)]`
          : message;
        await chatService.saveMessage(convId, 'user', messageToSave);

        // 7. Load memory context
        let conversationMemories = '';
        try {
          const memoryService = new ConversationMemoryService(githubToken);
          const summaries = await memoryService.getRecentSummaries(userId, 3, 4);
          if (summaries && summaries.length > 0) {
            conversationMemories = memoryService.formatMemoryContext(summaries);
          }
        } catch (e) {
          console.log('[ChatRoute] Memory load failed:', e);
        }

        // 8. Load RAG context
        let relevantContext = '';
        try {
          const embeddingService = new EmbeddingService(githubToken);
          const vectorService = new VectorSearchService(embeddingService);
          relevantContext = await vectorService.getRelevantContext(message, userId);
        } catch (e) {
          console.log('[ChatRoute] RAG search failed:', e);
        }

        // 9. Build enriched system message
        let enrichedSystemMessage = systemMessage;

        if (activeSkill) {
          try {
            const skillContent = await skillsService.getEnrichedSkillContent(activeSkill.id, userId, message);
            enrichedSystemMessage = `# Active Skill: ${activeSkill.display_name}\n\n${skillContent}\n\n---\n\n${enrichedSystemMessage}`;
            console.log(`[ChatRoute] Loaded skill: ${activeSkill.name}`);
          } catch (e) {
            console.error('[ChatRoute] Skill content failed:', e);
          }
        }

        if (conversationMemories) {
          enrichedSystemMessage = conversationMemories + '\n\n' + enrichedSystemMessage;
        }

        if (relevantContext && !relevantContext.includes('No relevant documents found')) {
          enrichedSystemMessage += '\n\n' + relevantContext;
        }

        // Load conversation history and build messages array
        const history = await chatService.loadMessages(convId);
        const conversationMessages: Array<{
          role: string;
          content: string | any[];
          tool_call_id?: string;
          tool_calls?: any;
        }> = [
          { role: 'system', content: enrichedSystemMessage },
          ...history.map((m: any) => ({ role: m.role, content: m.content })),
        ];

        // Build multimodal last message if images are provided
        if (imageAttachments && imageAttachments.length > 0) {
          const lastIdx = conversationMessages.length - 1;
          const contentParts: any[] = [{ type: 'text', text: message }];
          for (const img of imageAttachments) {
            contentParts.push({ type: 'image_url', image_url: { url: img.url } });
          }
          conversationMessages[lastIdx] = { role: 'user', content: contentParts };
        }

        const llmService = new LLMService(provider, modelBaseUrl, { githubToken });

        // 10. First LLM call — non-streaming for tool detection
        let data = await llmService.chatCompletion({
          messages: conversationMessages,
          model: modelId,
          temperature: 0.7,
          max_tokens: 2000,
          tools: TOOLS,
          tool_choice: 'auto',
        });
        let assistantMessage = data.choices[0].message;

        // 11. Tool loop — non-streaming until no more tool calls
        while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          conversationMessages.push(assistantMessage);

          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            const toolCallId = toolCall.id || `call_${toolName}_${Date.now()}`;
            const rawArgs = toolCall.function.arguments;
            const toolArgs = rawArgs == null
              ? {}
              : typeof rawArgs === 'object'
                ? rawArgs
                : (() => { try { return JSON.parse(rawArgs); } catch { return {}; } })();

            controller.enqueue(encode({ type: 'tool_call', name: toolName, args: toolArgs }));

            try {
              let toolResult: any;
              if (toolName === 'search_web' && tavilyApiKey) {
                const searchTool = new SearchWebTool(tavilyApiKey);
                toolResult = await searchTool.execute(toolArgs.query);
              } else if (toolName === 'execute_shell') {
                const shellTool = new ShellTool();
                toolResult = await shellTool.execute(toolArgs.command, toolArgs.cwd, toolArgs.timeout);
              } else {
                toolResult = { error: `Tool ${toolName} not available` };
              }
              controller.enqueue(encode({ type: 'tool_result', name: toolName, success: true }));
              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCallId,
                content: JSON.stringify(toolResult),
              });
            } catch (error: any) {
              controller.enqueue(encode({ type: 'tool_result', name: toolName, success: false }));
              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCallId,
                content: JSON.stringify({ error: error.message }),
              });
            }
          }

          data = await llmService.chatCompletion({
            messages: conversationMessages,
            model: modelId,
            temperature: 0.7,
            max_tokens: 2000,
            tools: TOOLS,
            tool_choice: 'auto',
          });
          assistantMessage = data.choices[0].message;
        }

        // 12. Final LLM call — streaming for the user-facing response
        let fullContent = '';
        for await (const token of llmService.streamChatCompletion({
          messages: conversationMessages,
          model: modelId,
          temperature: 0.7,
          max_tokens: 2000,
        })) {
          fullContent += token;
          controller.enqueue(encode({ type: 'token', content: token }));
        }

        // 13. Save assistant message to DB
        await chatService.saveMessage(convId, 'assistant', fullContent);

        // Track skill usage
        if (activeSkill) {
          try {
            await skillsService.completeSkillUsage(convId, true, undefined, assistantMessage.tool_calls?.length || 0);
          } catch (e) {
            console.error('[ChatRoute] Skill usage tracking failed:', e);
          }
        }

        // 14. Signal completion
        controller.enqueue(encode({ type: 'done', conversationId: convId }));
        controller.close();
      } catch (error: any) {
        console.error('[ChatRoute] Error:', error);
        try {
          controller.enqueue(encode({ type: 'error', message: error.message || 'Internal server error' }));
        } catch { /* controller may already be closed */ }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // disable nginx buffering if present
    },
  });
}
