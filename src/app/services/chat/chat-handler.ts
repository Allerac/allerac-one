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

export interface ChatHandlerConfig {
  userId: string;
  githubToken: string;
  tavilyApiKey?: string;
  selectedModel: string;
  modelProvider: 'github' | 'ollama';
  modelBaseUrl: string;
  systemMessage: string;
  botId?: string;  // For Telegram bot skill assignment
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
  const { userId, githubToken, tavilyApiKey, selectedModel, modelProvider, modelBaseUrl, systemMessage, botId } = config;

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
    const defaultSkill = botId 
      ? await skillsService.getDefaultBotSkill(botId)
      : await skillsService.getDefaultUserSkill(userId);
    
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

  // Check if we should auto-switch skills based on message content
  if (activeSkill) {
    // Get all available skills for auto-switching
    const availableSkills = botId
      ? await skillsService.getBotSkills(botId)
      : await skillsService.getUserSkills(userId);

    // Check if any skill should auto-activate
    for (const skill of availableSkills) {
      if (skill.id !== activeSkill.id && skill.auto_switch_rules) {
        const shouldSwitch = await skillsService.shouldAutoActivate(skill, {
          message,
          conversationHistory: await chatService.loadMessages(convId),
        });

        if (shouldSwitch) {
          await skillsService.activateSkill(
            skill.id,
            convId,
            userId,
            'auto',
            message,
            botId
          );
          activeSkill = skill;
          console.log(`[ChatHandler] Auto-switched to skill: ${skill.name}`);
          break;
        }
      }
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
    const memoryService = new ConversationMemoryService(githubToken);
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
    relevantContext = await vectorService.getRelevantContext(message, userId);
  } catch (error) {
    console.log('[ChatHandler] No documents or RAG search failed:', error);
  }

  // 4. Build system message with context
  let enrichedSystemMessage = systemMessage || 'You are a helpful AI assistant.';

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
  const llmService = new LLMService(modelProvider, modelBaseUrl, { githubToken });

  let data = await llmService.chatCompletion({
    messages: conversationMessages,
    model: selectedModel,
    temperature: 0.7,
    max_tokens: 2000,
    tools: TOOLS,
    tool_choice: 'auto',
  });

  let assistantMessage = data.choices[0].message;

  // 6. Handle tool calls
  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
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
        if (toolName === 'search_web' && tavilyApiKey) {
          const searchTool = new SearchWebTool(tavilyApiKey);
          toolResult = await searchTool.execute(toolArgs.query);
        } else if (toolName === 'execute_shell') {
          const shellTool = new ShellTool();
          toolResult = await shellTool.execute(toolArgs.command, toolArgs.cwd, toolArgs.timeout);
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
      tools: TOOLS,
      tool_choice: 'auto',
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
  githubToken: string
): Promise<void> {
  try {
    const memoryService = new ConversationMemoryService(githubToken);
    const shouldSummarize = await memoryService.shouldSummarizeConversation(conversationId);
    if (shouldSummarize) {
      await memoryService.generateConversationSummary(conversationId, userId);
      console.log(`[ChatHandler] Summary generated for conversation ${conversationId}`);
    }
  } catch (error) {
    console.error('[ChatHandler] Failed to summarize:', error);
  }
}
