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
import { ChatService } from '../database/chat.service';
import { TOOLS } from '../../tools/tools';

export interface ChatHandlerConfig {
  userId: string;
  githubToken: string;
  tavilyApiKey?: string;
  selectedModel: string;
  modelProvider: 'github' | 'ollama';
  modelBaseUrl: string;
  systemMessage: string;
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
  config: ChatHandlerConfig
): Promise<ChatHandlerResult> {
  const { userId, githubToken, tavilyApiKey, selectedModel, modelProvider, modelBaseUrl, systemMessage } = config;

  // 1. Create conversation if needed
  let convId = conversationId;
  if (!convId) {
    // Summarize previous conversation if exists
    // (handled externally by the caller if needed)
    const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
    convId = await chatService.createConversation(userId, title);
    if (!convId) throw new Error('Failed to create conversation');
  }

  // Save user message
  await chatService.saveMessage(convId, 'user', message);

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
    content: string;
    tool_call_id?: string;
    tool_calls?: any;
  }> = [
    { role: 'system', content: enrichedSystemMessage },
    ...history.map((m: any) => ({ role: m.role, content: m.content })),
  ];

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
    conversationMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

      try {
        let toolResult: any;
        if (toolName === 'search_web' && tavilyApiKey) {
          const searchTool = new SearchWebTool(tavilyApiKey);
          toolResult = await searchTool.execute(toolArgs.query);
        } else {
          toolResult = { error: `Tool ${toolName} not available` };
        }

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      } catch (error: any) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
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
