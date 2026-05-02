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
import { ALLERAC_SOUL } from '@/app/config/allerac-soul';
import { SearchWebTool } from '@/app/tools/search-web.tool';
import { ShellTool } from '@/app/tools/shell.tool';
import { HealthTool } from '@/app/tools/health.tool';
import { InstagramTool } from '@/app/tools/instagram.tool';
import { skillsService } from '@/app/services/skills/skills.service';
import { TOOLS } from '@/app/tools/tools';
import pool from '@/app/clients/db';
import * as instagramActions from '@/app/actions/instagram';
import { getImageUploadService } from '@/app/services/image-upload';

const authService = new AuthService();
const userSettingsService = new UserSettingsService();
const chatService = new ChatService();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

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
    defaultSkillName,
    domain,
  }: {
    message: string;
    conversationId: string | null;
    model: string;
    provider: 'github' | 'ollama' | 'gemini' | 'anthropic';
    imageAttachments?: Array<{ url: string }>;
    preSelectedSkillId?: string;
    defaultSkillName?: string;
    domain?: string;
  } = body;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;

  const stream = new ReadableStream({
    async start(controller) {
      // Enqueue immediately so Next.js flushes the 200 + text/event-stream headers
      // before any async work. Without this, Cloudflare waits for the first byte
      // and issues a 524 if the LLM or DB takes more than ~100 s.
      controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));

      // Guard against writing to a closed controller (client disconnect mid-stream)
      let streamClosed = false;
      request.signal?.addEventListener('abort', () => { streamClosed = true; });
      const safeEnqueue = (data: Uint8Array) => {
        if (streamClosed) return;
        try { controller.enqueue(data); } catch { streamClosed = true; }
      };

      try {
        // 1. Authenticate via session cookie
        if (!sessionToken) {
          safeEnqueue(encode({ type: 'error', message: 'Unauthorized' }));
          controller.close();
          return;
        }

        const user = await authService.validateSession(sessionToken);
        if (!user) {
          safeEnqueue(encode({ type: 'error', message: 'Unauthorized' }));
          controller.close();
          return;
        }

        const userId = user.id;

        // Log domain entry — visible in System Monitor
        const providerLabel = provider === 'ollama' ? `● LOCAL · ${modelId}` : `◌ ${provider} · ${modelId}`;
        console.log(`[ChatRoute] ► ${domain ?? 'Chat'} — ${providerLabel}`);

        // Auto-upload images before processing
        console.log('[ChatRoute] Received imageAttachments:', imageAttachments?.length ?? 0);
        let processedImages = imageAttachments;
        if (imageAttachments && imageAttachments.length > 0) {
          try {
            const uploadService = getImageUploadService();
            const uploadedImages: Array<{ url: string }> = [];

            for (const img of imageAttachments) {
              // Extract base64 from data URI
              const dataUriMatch = img.url.match(/^data:image\/(\w+);base64,(.+)$/);
              if (dataUriMatch) {
                const [, mimeType, base64] = dataUriMatch;
                const buffer = Buffer.from(base64, 'base64');
                const filename = `chat-image-${Date.now()}.${mimeType === 'jpeg' ? 'jpg' : mimeType}`;

                console.log(`[ChatRoute] Uploading image: ${filename}`);
                const uploaded = await uploadService.upload(buffer, filename);
                uploadedImages.push({ url: uploaded.publicUrl });
                console.log(`[ChatRoute] Image uploaded to: ${uploaded.publicUrl}`);
              } else {
                // If not a data URI, assume it's already a public URL
                uploadedImages.push(img);
              }
            }

            // Use uploaded URLs instead
            processedImages = uploadedImages;
          } catch (err: any) {
            console.warn('[ChatRoute] Image upload failed:', err.message);
            // Continue anyway — images might fail but we can still process the message
          }
        }

        // 2. Load user settings (API keys stay server-side)
        const settings = await userSettingsService.loadUserSettings(userId);
        const githubToken = settings?.github_token || process.env.GITHUB_TOKEN || '';
        const tavilyApiKey = settings?.tavily_api_key || process.env.TAVILY_API_KEY || undefined;
        const googleApiKey = settings?.google_api_key || '';
        const anthropicApiKey = settings?.anthropic_api_key || '';
        const userLocation = settings?.location || null;

        // Validate provider has required keys
        if (provider === 'anthropic' && !anthropicApiKey) {
          safeEnqueue(encode({
            type: 'error',
            message: '❌ **Anthropic API key not configured**\n\nPlease add your Anthropic API key in Settings → Developer API Keys.',
          }));
          controller.close();
          return;
        }

        // Always start from ALLERAC_SOUL, never replace it
        let systemMessage = ALLERAC_SOUL;

        // Inject structured user context
        const locale = cookieStore.get('locale')?.value || 'en';
        const languageNames: Record<string, string> = { en: 'English', pt: 'Portuguese', es: 'Spanish' };
        const language = languageNames[locale] || 'English';
        const contextLines: string[] = [];
        if (user.name) contextLines.push(`- Name: ${user.name}`);
        contextLines.push(`- Language: ${language} — always reply in this language`);

        // Inject current date and time
        const now = new Date();
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayDate = now.toISOString().split('T')[0];
        const todayTime = now.toTimeString().split(' ')[0];
        const todayWeekday = weekdays[now.getDay()];
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        contextLines.push(`- Current date & time: ${todayDate} ${todayWeekday}, ${todayTime} (${timezone})`);

        if (userLocation) contextLines.push(`- Location: ${userLocation}`);
        systemMessage += `\n\n## User context\n${contextLines.join('\n')}`;

        // Inject user's About Me as instructions (if set)
        const aboutMe = settings?.system_message;
        const hasAboutMe = aboutMe && aboutMe !== 'You are a helpful AI assistant.';
        if (hasAboutMe) {
          systemMessage += `\n\n## User instructions\n${aboutMe}`;
        }

        if (userLocation) {
          systemMessage += '\n\nWhen the user asks about weather, temperature, or anything requiring real-time local information, use the search_web tool to find current data for their location.';
        } else if (tavilyApiKey) {
          systemMessage += '\n\nWhen the user asks about current weather, news, prices, or any real-time information, use the search_web tool.';
        }

        if (!message && (!imageAttachments || imageAttachments.length === 0)) {
          safeEnqueue(encode({ type: 'error', message: 'Message is required' }));
          controller.close();
          return;
        }

        if (provider === 'gemini' && !googleApiKey) {
          safeEnqueue(encode({ type: 'error', message: 'Google API key is not configured. Please add it in Configuration → API Keys.' }));
          controller.close();
          return;
        }

        // Server-side base URL (never goes through client-side proxy)
        const modelBaseUrl = provider === 'ollama' ? OLLAMA_BASE_URL
                           : provider === 'gemini' ? GEMINI_BASE_URL
                           : provider === 'anthropic' ? ANTHROPIC_BASE_URL
                           : GITHUB_BASE_URL;

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
          // Client explicitly selected a skill before sending the first message (by ID)
          if (preSelectedSkillId) {
            const preSelected = await skillsService.getSkillById(preSelectedSkillId);
            if (preSelected) {
              await skillsService.activateSkill(preSelected.id, convId, userId, 'manual', 'Pre-selected by user');
              activeSkill = preSelected;
              console.log(`[ChatRoute] Activated pre-selected skill: ${preSelected.name}`);
            }
          }

          // Fallback: resolve by name (handles race condition where client-side lookup didn't complete)
          if (!activeSkill && defaultSkillName) {
            const byName = await skillsService.getSkillByName(defaultSkillName, userId);
            if (byName) {
              await skillsService.activateSkill(byName.id, convId, userId, 'manual', 'Domain default skill');
              activeSkill = byName;
              console.log(`[ChatRoute] Activated domain default skill: ${byName.name}`);
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

        // Auto-activate or auto-switch skills via LLM intent detection (keyword fallback).
        // Skip if:
        //   (a) skill was just pre-selected by domain on THIS message (first msg, new conversation), OR
        //   (b) the active skill was manually activated (domain-locked conversation — user chose a specific domain)
        const isManuallyLocked = activeSkill
          ? await pool.query(
              `SELECT trigger_type FROM skill_usage
               WHERE conversation_id = $1 AND skill_id = $2
               ORDER BY started_at DESC LIMIT 1`,
              [convId, activeSkill.id]
            ).then(r => r.rows[0]?.trigger_type === 'manual').catch(() => false)
          : false;

        if (!isManuallyLocked && (!preSelectedSkillId || inputConversationId)) {
          const availableSkills = await skillsService.getAvailableSkills(userId);
          const candidates = availableSkills.filter(s => s.id !== activeSkill?.id);
          const detected = await skillsService.detectIntent(message, candidates);
          if (detected) {
            await skillsService.activateSkill(detected.id, convId, userId, 'auto', message);
            activeSkill = detected;
            console.log(`[ChatRoute] Auto-activated skill: ${detected.name}`);
            safeEnqueue(encode({
              type: 'skill_activated',
              skill: { id: detected.id, name: detected.name, display_name: detected.display_name },
            }));
          }
        }

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

        // Filter tools based on active skill — avoid confusing the model with irrelevant tools
        const SHELL_SKILLS = ['programmer'];
        const HEALTH_TOOL_NAMES = ['get_health_summary', 'get_health_metrics', 'get_daily_snapshot', 'get_garmin_status', 'get_recent_activities'];
        const INSTAGRAM_TOOL_NAMES = ['instagram_create_post_draft', 'instagram_publish_post', 'instagram_get_profile', 'instagram_get_recent_posts'];
        const activeSkillName = activeSkill?.name ?? '';
        const activeTools = TOOLS.filter(t => {
          if (t.function.name === 'execute_shell') return SHELL_SKILLS.includes(activeSkillName);
          if (HEALTH_TOOL_NAMES.includes(t.function.name)) return activeSkillName === 'health';
          if (INSTAGRAM_TOOL_NAMES.includes(t.function.name)) return activeSkillName === 'social';
          return true; // search_web always available
        });

        if (conversationMemories) {
          enrichedSystemMessage = conversationMemories + '\n\n' + enrichedSystemMessage;
        }

        if (relevantContext && !relevantContext.includes('No relevant documents found')) {
          enrichedSystemMessage += '\n\n' + relevantContext;
        }

        // Only inject workspace path if skill needs it (e.g., programmer skill for file operations)
        const WORKSPACE_SKILLS = ['programmer'];
        if (activeSkill && WORKSPACE_SKILLS.includes(activeSkill.name)) {
          const workspacePath = `/workspace/projects/${userId}`;
          const beforePathInject = enrichedSystemMessage;
          enrichedSystemMessage = enrichedSystemMessage.replace(
            /\/workspace\/projects\//g,
            `${workspacePath}/`
          );
          // Also handle cases where the path appears at end of string or without trailing slash
          enrichedSystemMessage = enrichedSystemMessage.replace(
            /\/workspace\/projects(?=\s|$|["'])/g,
            workspacePath
          );

          const pathReplacements = (beforePathInject.match(/\/workspace\/projects/g) || []).length;
          if (pathReplacements > 0) {
            console.log(`[ChatRoute] Injected workspace path for ${activeSkill.name}: replaced ${pathReplacements} instances`);
          }
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

        const llmService = new LLMService(provider, modelBaseUrl, { githubToken, geminiToken: googleApiKey, anthropicToken: anthropicApiKey });

        // 10. First LLM call — non-streaming for tool detection
        {
          // Send periodic keepalives during long LLM calls to prevent client timeout
          const keepaliveInterval = setInterval(() => {
            try {
              safeEnqueue(new TextEncoder().encode(': keepalive\n\n'));
            } catch {
              clearInterval(keepaliveInterval);
            }
          }, 15000); // Every 15 seconds

          // Determine tool_choice: force a specific tool if the active skill requires it,
          // otherwise use 'auto' (Gemini doesn't support tool_choice, so skip for gemini)
          const forceTool = activeSkill?.force_tool ?? null;
          const initialToolChoice = forceTool
            ? { type: 'function', function: { name: forceTool } }
            : provider !== 'gemini' ? 'auto' : undefined;

          console.log('[ChatRoute] Starting first LLM call (tool detection)...');
          const lastMsg = conversationMessages[conversationMessages.length - 1];
          console.log('[ChatRoute] Last message content type:', Array.isArray(lastMsg?.content) ? 'multimodal' : typeof lastMsg?.content);
          if (Array.isArray(lastMsg?.content)) {
            console.log('[ChatRoute] Multimodal parts:', lastMsg.content.map((p: any) => p.type));
          }
          let data = await llmService.chatCompletion({
            messages: conversationMessages,
            model: modelId,
            temperature: 0.7,
            max_tokens: 2000,
            tools: activeTools,
            ...(initialToolChoice !== undefined && { tool_choice: initialToolChoice }),
          });
          console.log('[ChatRoute] First LLM call completed');
          clearInterval(keepaliveInterval);
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

              safeEnqueue(encode({ type: 'tool_call', name: toolName, args: toolArgs }));

              try {
                let toolResult: any;
                if (toolName === 'get_today_info') {
                  const { TodayTool } = await import('@/app/tools/today.tool');
                  toolResult = new TodayTool().execute();
                } else if (toolName === 'search_web' && tavilyApiKey) {
                  const searchTool = new SearchWebTool(tavilyApiKey, githubToken);
                  toolResult = await searchTool.execute(toolArgs.query);
                } else if (toolName === 'execute_shell') {
                  const shellTool = new ShellTool();
                  toolResult = await shellTool.execute(toolArgs.command, toolArgs.cwd, toolArgs.timeout);
                } else if (INSTAGRAM_TOOL_NAMES.includes(toolName)) {
                  const igTool = new InstagramTool();
                  if (toolName === 'instagram_create_post_draft') {
                    let { caption, tags, image_url } = toolArgs;

                    // Only auto-generate if image_url is a public URL (not data URI)
                    // Data URIs will be handled client-side
                    const isPublicUrl = image_url && (image_url.startsWith('http://') || image_url.startsWith('https://'));

                    // Auto-generate caption and tags if image_url is public URL but caption is empty
                    if (isPublicUrl && !caption) {
                      try {
                        console.log('[Instagram] Generating caption from image...');
                        // Pass user's message as context for caption generation
                        const captionRes = await instagramActions.generateCaption(image_url, userId, message);
                        if (captionRes.success) {
                          caption = captionRes.caption;
                          console.log('[Instagram] Caption generated:', caption);
                        } else {
                          console.warn('[Instagram] Failed to generate caption:', captionRes.error);
                        }
                      } catch (err: any) {
                        console.error('[Instagram] Caption generation error:', err.message);
                      }
                    }

                    // Auto-generate tags if caption is available but tags are empty
                    if (caption && !tags) {
                      try {
                        console.log('[Instagram] Generating tags from caption...');
                        const tagsRes = await instagramActions.generateTags(userId, caption);
                        if (tagsRes.success) {
                          tags = tagsRes.tags;
                          console.log('[Instagram] Tags generated:', tags);
                        } else {
                          console.warn('[Instagram] Failed to generate tags:', tagsRes.error);
                        }
                      } catch (err: any) {
                        console.error('[Instagram] Tags generation error:', err.message);
                      }
                    }

                    safeEnqueue(encode({
                      type: 'instagram_draft',
                      caption: caption || '',
                      tags: tags || '',
                      image_url: image_url || '',
                    }));
                    toolResult = {
                      success: true,
                      message: 'Post draft prepared. A preview button has been shown to the user.',
                    };
                  } else if (toolName === 'instagram_publish_post') {
                    toolResult = await igTool.publishPost(userId, toolArgs.caption, toolArgs.image_url);
                  } else if (toolName === 'instagram_get_profile') {
                    toolResult = await igTool.getProfile(userId);
                  } else {
                    toolResult = await igTool.getRecentMedia(userId, toolArgs.limit ?? 6);
                  }
                } else if (['get_health_summary', 'get_health_metrics', 'get_daily_snapshot', 'get_garmin_status', 'get_recent_activities'].includes(toolName)) {
                  const healthTool = new HealthTool();
                  const healthUser = { id: userId, email: user.email, name: user.name || user.email };
                  if (toolName === 'get_health_summary') {
                    toolResult = await healthTool.getSummary(healthUser, toolArgs.period || 'week');
                  } else if (toolName === 'get_health_metrics') {
                    toolResult = await healthTool.getMetrics(healthUser, toolArgs.start_date, toolArgs.end_date);
                  } else if (toolName === 'get_daily_snapshot') {
                    toolResult = await healthTool.getDailySnapshot(healthUser, toolArgs.date);
                  } else if (toolName === 'get_recent_activities') {
                    toolResult = await healthTool.getRecentActivities(healthUser, toolArgs.limit || 10);
                  } else {
                    toolResult = await healthTool.getGarminStatus(healthUser);
                  }
                } else {
                  toolResult = { error: `Tool ${toolName} not available` };
                }
                safeEnqueue(encode({ type: 'tool_result', name: toolName, success: true }));
                conversationMessages.push({
                  role: 'tool',
                  tool_call_id: toolCallId,
                  content: JSON.stringify(toolResult),
                });
              } catch (error: any) {
                safeEnqueue(encode({ type: 'tool_result', name: toolName, success: false }));
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
              tools: activeTools,
              tool_choice: 'auto',
            });
            assistantMessage = data.choices[0].message;
          }
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
          safeEnqueue(encode({ type: 'token', content: token }));
        }

        // 13. Save assistant message to DB
        await chatService.saveMessage(convId, 'assistant', fullContent);

        // Track skill usage
        if (activeSkill) {
          try {
            await skillsService.completeSkillUsage(convId, true, undefined, 0);
          } catch (e) {
            console.error('[ChatRoute] Skill usage tracking failed:', e);
          }
        }

        // 14. Signal completion
        safeEnqueue(encode({ type: 'done', conversationId: convId }));
        controller.close();
      } catch (error: any) {
        console.error('[ChatRoute] Caught error:', {
          message: error.message,
          code: error.code,
          stack: error.stack,
        });
        try {
          safeEnqueue(encode({ type: 'error', message: error.message || 'Internal server error' }));
          controller.close();
        } catch (closeError: any) {
          console.error('[ChatRoute] Failed to send error event (controller already closed):', closeError.message);
        }
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
