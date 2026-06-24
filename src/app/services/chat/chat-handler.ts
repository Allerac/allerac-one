/**
 * Framework-agnostic chat handler
 *
 * Extracts the core chat logic from ChatMessageService (React-coupled)
 * so it can be reused by both the web UI and the Telegram bot.
 */

import { LLMService } from '../llm/llm.service';
import { ConversationMemoryService } from '../memory/conversation-memory.service';
import { VectorSearchService } from '../rag/vector-search.service';
import { EmbeddingService } from '../rag/embedding.service';
import { SearchWebTool } from '../../tools/search-web.tool';
import { ShellTool } from '../../tools/shell.tool';
import { ChatService } from '../database/chat.service';
import { skillsService } from '../skills/skills.service';
import { TOOLS } from '../../tools/tools';
import { buildNotesTools } from '../../tools/notes.tool';
import { buildEmailTools } from '../../tools/email.tool';
import { HealthTool } from '../../tools/health.tool';
import { buildSoul } from '@/app/config/allerac-soul';
import pool from '@/app/clients/db';
import { normalizeWorkspaceReferences, resolveShellCwd } from '@/app/lib/workspace-paths';

export interface ChatHandlerConfig {
  userId: string;
  githubToken: string;
  geminiToken?: string;
  anthropicToken?: string;
  tavilyApiKey?: string;
  selectedModel: string;
  modelProvider: 'github' | 'ollama' | 'gemini' | 'anthropic';
  modelBaseUrl: string;
  systemMessage: string;
  botId?: string;  // For Telegram bot skill assignment
  domainSlug?: string | null;
  language?: string; // e.g. 'en', 'pt', 'es' — injected into system context
}

export interface ChatImageAttachment {
  data: Buffer;
  mimeType: string;
  filename?: string;
}

export interface ChatHandlerResult {
  conversationId: string;
  response: string;
}

const chatService = new ChatService();

/**
 * Process a user message through the full AI pipeline:
 * 1. Create/reuse conversation
 * 2. Load memory context (past conversation summaries)
 * 3. Load RAG context (relevant documents)
 * 4. Call LLM with enriched context
 * 5. Handle tool calls (web search)
 * 6. Save messages to database
 * 7. Return response
 */
export async function handleChatMessage(
  message: string,
  conversationId: string | null,
  config: ChatHandlerConfig,
  imageAttachments?: ChatImageAttachment[]
): Promise<ChatHandlerResult> {
  const { userId, githubToken, geminiToken, anthropicToken, tavilyApiKey, selectedModel, modelProvider, modelBaseUrl, systemMessage, botId, domainSlug, language } = config;

  // 1. Create conversation if needed
  let convId = conversationId;
  if (!convId) {
    // Summarize previous conversation if exists
    // (handled externally by the caller if needed)
    const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    convId = await chatService.createConversation(userId, title);
    if (!convId) throw new Error('Failed to create conversation');
  }

  // Load active skill or activate default skill for new conversations
  let activeSkill = await skillsService.getActiveSkill(convId);
  
  if (!activeSkill && !conversationId) {
    // New conversation - try to load default skill
    // Priority: bot default → chat domain default → user default
    let defaultSkill = botId
      ? await skillsService.getDefaultBotSkill(botId)
      : await skillsService.getDefaultUserSkill(userId);

    // Fallback: if bot has no default skill configured, use the chat domain default
    if (!defaultSkill && botId) {
      defaultSkill = await skillsService.getDefaultDomainSkill('chat');
    }

    if (defaultSkill) {
      await skillsService.activateSkill(
        defaultSkill.id,
        convId,
        userId,
        'auto',
        'Default skill activated',
        botId
      );
      activeSkill = defaultSkill;
      console.log(`[ChatHandler] Activated default skill: ${defaultSkill.name}`);
    }
  }

  // Auto-switch skills via LLM intent detection (keyword fallback)
  {
    const availableSkills = botId
      ? await skillsService.getBotSkills(botId)
      : await skillsService.getUserSkills(userId);
    const candidates = availableSkills.filter(s => s.id !== activeSkill?.id);
    const detected = await skillsService.detectIntent(message, candidates);
    if (detected) {
      await skillsService.activateSkill(detected.id, convId, userId, 'auto', message, botId);
      activeSkill = detected;
      console.log(`[ChatHandler] Auto-switched to skill: ${detected.name}`);
    }
  }

  // Filter available tools by skill assignment
  let activeTools: typeof TOOLS = TOOLS;
  if (activeSkill?.id) {
    const allowedToolNames = await skillsService.getSkillTools(activeSkill.id);
    if (allowedToolNames.length > 0) {
      activeTools = TOOLS.filter(t => allowedToolNames.includes(t.function.name));
    }
  }

  // Save user message (with image indicator if present)
  const messageToSave = imageAttachments && imageAttachments.length > 0
    ? `${message} [Image attached: ${imageAttachments.length} file(s)]`
    : message;
  await chatService.saveMessage(convId, 'user', messageToSave);

  // 2. Load memory context
  let conversationMemories = '';
  try {
    const memoryService = new ConversationMemoryService(githubToken, domainSlug ?? 'chat');
    const summaries = await memoryService.getRecentSummaries(userId, 3, 4);
    if (summaries && summaries.length > 0) {
      conversationMemories = memoryService.formatMemoryContext(summaries);
    }
  } catch (error) {
    console.log('[ChatHandler] Failed to load memories:', error);
  }

  // 3. Load RAG context
  let relevantContext = '';
  try {
    const embeddingService = new EmbeddingService(githubToken);
    const vectorService = new VectorSearchService(embeddingService);
    relevantContext = await vectorService.getRelevantContext(message, userId, { domainSlug: domainSlug ?? null });
  } catch (error) {
    console.log('[ChatHandler] No documents or RAG search failed:', error);
  }

  // 4. Build system message with context
  const isCustomSoul = systemMessage && systemMessage !== 'You are a helpful AI assistant.';
  let enrichedSystemMessage = buildSoul(domainSlug);

  // Inject current date and time
  const now = new Date();
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDate = now.toISOString().split('T')[0];
  const todayTime = now.toTimeString().split(' ')[0];
  const todayWeekday = weekdays[now.getDay()];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const LANGUAGE_NAMES: Record<string, string> = { en: 'English', pt: 'Portuguese', es: 'Spanish', ca: 'Catalan', fr: 'French', de: 'German', it: 'Italian' };
  const languageName = language ? (LANGUAGE_NAMES[language] ?? language) : null;
  enrichedSystemMessage += `\n\n## Context\n- Current date & time: ${todayDate} ${todayWeekday}, ${todayTime} (${timezone})`;
  if (languageName) enrichedSystemMessage += `\n- Language: ${languageName} — always reply in this language`;

  if (isCustomSoul) {
    enrichedSystemMessage += `\n\n## About the user\n${systemMessage}`;
  }

  // Inject active skill content if available
  if (activeSkill) {
    try {
      const skillContent = await skillsService.getEnrichedSkillContent(
        activeSkill.id,
        userId,
        message
      );
      enrichedSystemMessage = `# Active Skill: ${activeSkill.display_name}\n\n${skillContent}\n\n---\n\n${enrichedSystemMessage}`;
      console.log(`[ChatHandler] Loaded skill content for: ${activeSkill.name}`);
    } catch (error) {
      console.error('[ChatHandler] Failed to load skill content:', error);
    }
  }

  if (conversationMemories) {
    enrichedSystemMessage = conversationMemories + '\n\n' + enrichedSystemMessage;
  }

  if (relevantContext && !relevantContext.includes('No relevant documents found')) {
    enrichedSystemMessage += '\n\n' + relevantContext;
  }

  // Inject user-scoped workspace path so the AI always writes to the right directory
  const workspacePath = `/workspace/projects/${userId}`;
  const before = enrichedSystemMessage;
  enrichedSystemMessage = enrichedSystemMessage.replace(
    /\/workspace\/projects\//g,
    `${workspacePath}/`
  );
  // Also handle cases where the path appears at end of string or without trailing slash
  enrichedSystemMessage = enrichedSystemMessage.replace(
    /\/workspace\/projects(?=\s|$|["'])/g,
    workspacePath
  );

  const pathReplacements = (before.match(/\/workspace\/projects/g) || []).length;
  if (pathReplacements > 0) {
    console.log(`[ChatHandler] Injected workspace path: replaced ${pathReplacements} instances of /workspace/projects with ${workspacePath}`);
  }

  // Load conversation history
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

  // Build multimodal message if images are provided
  if (imageAttachments && imageAttachments.length > 0) {
    // Replace last user message with multimodal content
    const lastUserMsgIndex = conversationMessages.length - 1;
    const contentParts: any[] = [
      { type: 'text', text: message }
    ];

    // Add images as base64 data URLs
    for (const img of imageAttachments) {
      const base64 = img.data.toString('base64');
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${base64}`
        }
      });
    }

    conversationMessages[lastUserMsgIndex] = {
      role: 'user',
      content: contentParts
    };
  }

  // 5. Call LLM
  const llmService = new LLMService(modelProvider, modelBaseUrl, { githubToken, geminiToken, anthropicToken });

  // If the active skill forces a specific tool, use it on the first call.
  // Otherwise, auto-force search_web for real-time queries (weather, news, prices)
  // when Tavily is available — unreliable models ignore tool_choice:'auto' for these.
  const forceTool = activeSkill?.force_tool ?? null;
  const REALTIME_KEYWORDS = [
    'weather', 'forecast', 'temperature', 'rain', 'snow', 'wind', 'humidity', 'storm',
    'news', 'latest', 'current', 'today', 'tonight', 'right now', 'price', 'stock',
    'clima', 'tempo', 'chuva', 'neve', 'previsão', 'notícia', 'notícias', 'agora', 'hoje',
    'météo', 'actualité', 'maintenant', 'aujourd\'hui',
    'tiempo', 'noticias', 'ahora', 'hoy',
  ];
  const messageLower = message.toLowerCase();
  const isRealtimeQuery = tavilyApiKey && REALTIME_KEYWORDS.some(kw => messageLower.includes(kw));
  // Gemini rejects tool_choice:'auto' — omit it and let the model decide by default
  const initialToolChoice = forceTool
    ? { type: 'function', function: { name: forceTool } }
    : isRealtimeQuery
      ? { type: 'function', function: { name: 'search_web' } }
      : modelProvider !== 'gemini' ? 'auto' : undefined;

  let data = await llmService.chatCompletion({
    messages: conversationMessages,
    model: selectedModel,
    temperature: 0.7,
    max_tokens: 2000,
    tools: activeTools,
    ...(initialToolChoice !== undefined && { tool_choice: initialToolChoice }),
  });

  let assistantMessage = data.choices[0].message;

  // 6. Handle tool calls (max 10 iterations to prevent infinite loops)
  let toolIterations = 0;
  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && toolIterations < 10) {
    toolIterations++;
    // Push the original assistant message unchanged so Ollama receives its own native format
    // (arguments as object, no id). OpenAI always provides id and string arguments — both work as-is.
    conversationMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      // Ollama omits id — generate one for our own bookkeeping
      const toolCallId = toolCall.id || `call_${toolName}_${Date.now()}`;
      // Ollama sends arguments as an object; OpenAI sends a JSON string — handle both
      const rawArgs = toolCall.function.arguments;
      const toolArgs = rawArgs == null
        ? {}
        : typeof rawArgs === 'object'
          ? rawArgs
          : (() => { try { return JSON.parse(rawArgs); } catch { return {}; } })();

      console.log(`[ChatHandler] Tool call: ${toolName}`, JSON.stringify(toolArgs));

      try {
        let toolResult: any;
        if (toolName === 'get_today_info') {
          const { TodayTool } = await import('@/app/tools/today.tool');
          toolResult = new TodayTool().execute();
        } else if (toolName === 'search_web' && tavilyApiKey) {
          const searchTool = new SearchWebTool(tavilyApiKey);
          toolResult = await searchTool.execute(toolArgs.query);
        } else if (['save_note', 'query_vault', 'list_notes', 'delete_note', 'update_note'].includes(toolName)) {
          const noteHandlers = buildNotesTools({ id: userId, githubToken });
          const handler = noteHandlers[toolName as keyof typeof noteHandlers];
          toolResult = await handler(toolArgs);
        } else if (['list_emails', 'read_email', 'send_email'].includes(toolName)) {
          const emailHandlers = buildEmailTools(userId);
          const handler = emailHandlers[toolName as keyof typeof emailHandlers];
          toolResult = await handler(toolArgs as any);
        } else if (['get_health_summary', 'get_health_metrics', 'get_daily_snapshot', 'get_garmin_status', 'get_recent_activities'].includes(toolName)) {
          const userRes = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
          const u = userRes.rows[0];
          if (!u) {
            toolResult = { error: 'User not found' };
          } else {
            const healthTool = new HealthTool();
            const healthUser = { id: u.id, email: u.email, name: u.name || u.email };
            if (toolName === 'get_health_summary') {
              toolResult = await healthTool.getSummary(healthUser, toolArgs.period || 'week');
            } else if (toolName === 'get_health_metrics') {
              toolResult = await healthTool.getMetrics(healthUser, toolArgs.start_date, toolArgs.end_date);
            } else if (toolName === 'get_daily_snapshot') {
              toolResult = await healthTool.getDailySnapshot(healthUser, toolArgs.date);
            } else if (toolName === 'get_recent_activities') {
              toolResult = await healthTool.getRecentActivities(healthUser, toolArgs.limit || 10, toolArgs.start_date, toolArgs.end_date);
            } else {
              toolResult = await healthTool.getGarminStatus(healthUser);
            }
          }
        } else if (toolName === 'execute_shell') {
          const shellTool = new ShellTool();
          const safeCwd = resolveShellCwd(userId, toolArgs.cwd);
          if (!safeCwd) {
            toolResult = { error: 'Invalid cwd. Shell commands must run inside your workspace.' };
          } else {
            const scopedCommand = normalizeWorkspaceReferences(userId, String(toolArgs.command || ''));
            toolResult = await shellTool.execute(scopedCommand, safeCwd, toolArgs.timeout);
          }
        } else {
          toolResult = { error: `Tool ${toolName} not available` };
        }

        console.log(`[ChatHandler] Tool result for ${toolName}:`, toolResult);

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(toolResult),
        });
      } catch (error: any) {
        console.error(`[ChatHandler] Tool error for ${toolName}:`, error);
        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: error.message }),
        });
      }
    }

    data = await llmService.chatCompletion({
      messages: conversationMessages,
      model: selectedModel,
      temperature: 0.7,
      max_tokens: 2000,
      tools: activeTools,
      ...(modelProvider !== 'gemini' && { tool_choice: 'auto' }),
    });
    assistantMessage = data.choices[0].message;
  }

  // 7. Save assistant response
  await chatService.saveMessage(convId, 'assistant', assistantMessage.content);

  // Track skill usage completion
  if (activeSkill) {
    try {
      await skillsService.completeSkillUsage(
        convId,
        true,
        data.usage?.total_tokens,
        assistantMessage.tool_calls?.length || 0
      );
    } catch (error) {
      console.error('[ChatHandler] Failed to track skill usage:', error);
    }
  }

  return {
    conversationId: convId,
    response: assistantMessage.content,
  };
}

/**
 * Summarize a conversation if it meets the criteria
 */
export async function maybeSummarizeConversation(
  conversationId: string,
  userId: string,
  githubToken: string,
  domainSlug: string = 'chat'
): Promise<void> {
  try {
    const memoryService = new ConversationMemoryService(githubToken, domainSlug);
    const shouldSummarize = await memoryService.shouldSummarizeConversation(conversationId, userId);
    if (shouldSummarize) {
      await memoryService.generateConversationSummary(conversationId, userId);
      console.log(`[ChatHandler] Summary generated for conversation ${conversationId}`);
    }
  } catch (error) {
    console.error('[ChatHandler] Failed to summarize:', error);
  }
}
