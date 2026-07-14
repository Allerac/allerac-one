import type { User } from '@/app/services/auth/auth.service';
import { ChatService } from '@/app/services/database/chat.service';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { VectorSearchService } from '@/app/services/rag/vector-search.service';
import { EmbeddingService } from '@/app/services/rag/embedding.service';
import { skillsService } from '@/app/services/skills/skills.service';
import { buildChatSystemPrompt } from '@/app/services/chat/prompt-builder';
import { resolveChatTools } from '@/app/services/chat/chat-tool-registry';
import { resolveActiveChatSkill } from '@/app/services/chat/chat-skill-resolver';
import { runChatPipeline } from '@/app/services/chat/chat-pipeline';
import { loadChatRuntimeContext } from '@/app/services/chat/chat-runtime-context';
import { processChatImages } from '@/app/services/chat/chat-image-processor';
import type { ChatImageAttachment, ChatProvider } from '@/app/services/chat/chat-request-parser';

const chatService = new ChatService();

export interface ChatExecutionInput {
  user: User;
  conversationId: string;
  domain: string;
  message: string;
  modelId: string;
  provider: ChatProvider;
  locale: string;
  imageAttachments?: ChatImageAttachment[];
  preSelectedSkillId?: string;
  defaultSkillName?: string;
  postContext?: string;
  emit?: (event: Record<string, any>) => void;
  keepalive?: () => void;
}

export interface ChatExecutionResult {
  conversationId: string;
  content: string;
  events: Array<Record<string, any>>;
}

export class ChatConversationNotFoundError extends Error {
  constructor() {
    super('Conversation not found');
    this.name = 'ChatConversationNotFoundError';
  }
}

export class ChatMessagePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatMessagePersistenceError';
  }
}

export async function executeChatMessage(input: ChatExecutionInput): Promise<ChatExecutionResult> {
  const events: Array<Record<string, any>> = [];
  const emit = (event: Record<string, any>) => {
    events.push(event);
    input.emit?.(event);
  };

  const conversation = await chatService.getConversationForUser(input.conversationId, input.user.id);
  if (!conversation || conversation.domain_slug !== input.domain) {
    throw new ChatConversationNotFoundError();
  }

  const processedImages = await processChatImages(input.imageAttachments);
  const runtimeContext = await loadChatRuntimeContext(input.user.id, input.domain, input.provider);
  const {
    githubToken,
    tavilyApiKey,
    googleApiKey,
    anthropicApiKey,
    userLocation,
    userInstructions,
    modelBaseUrl,
  } = runtimeContext;

  const activeSkill = await resolveActiveChatSkill({
    conversationId: input.conversationId,
    userId: input.user.id,
    message: input.message,
    isNewConversation: false,
    preSelectedSkillId: input.preSelectedSkillId,
    defaultSkillName: input.defaultSkillName,
    emit,
  });

  let finalMessage = input.message;
  if (processedImages && processedImages.length > 0) {
    const imageUrls = processedImages.map(img => img.url);
    finalMessage += `\n\n[Image URLs: ${imageUrls.join(', ')}]`;
  }

  const messageToSave = processedImages && processedImages.length > 0
    ? `${finalMessage} [Image attached: ${processedImages.length} file(s)]`
    : input.message;
  const savedUserMessage = await chatService.saveMessage(input.conversationId, 'user', messageToSave, { userId: input.user.id });
  if (!savedUserMessage.success) {
    throw new ChatMessagePersistenceError('Failed to save user message');
  }

  let conversationMemories = '';
  try {
    const memoryService = new ConversationMemoryService(githubToken, input.domain);
    const summaries = await memoryService.getRecentSummaries(input.user.id, 3, 4);
    if (summaries && summaries.length > 0) {
      conversationMemories = memoryService.formatMemoryContext(summaries);
    }
  } catch (error) {
    console.log('[ChatExecution] Memory load failed:', error);
  }

  let relevantContext = '';
  try {
    const embeddingService = new EmbeddingService(githubToken);
    const vectorService = new VectorSearchService(embeddingService);
    relevantContext = await vectorService.getRelevantContext(input.message, input.user.id, { domainSlug: input.domain });
  } catch (error) {
    console.log('[ChatExecution] RAG search failed:', error);
  }

  let skillContent = '';
  if (activeSkill) {
    try {
      skillContent = await skillsService.getEnrichedSkillContent(activeSkill.id, input.user.id, input.message);
    } catch (error) {
      console.error('[ChatExecution] Skill content failed:', error);
    }
  }

  const enrichedSystemMessage = buildChatSystemPrompt({
    user: input.user,
    locale: input.locale,
    domain: input.domain,
    userLocation,
    tavilyConfigured: Boolean(tavilyApiKey),
    userInstructions,
    postContext: input.postContext,
    activeSkill,
    skillContent,
    conversationMemories,
    relevantContext,
  });

  const activeTools = await resolveChatTools(activeSkill?.id, input.domain);
  const history = await chatService.loadMessages(input.conversationId, input.user.id);
  const conversationMessages: Array<{
    role: string;
    content: string | any[];
    tool_call_id?: string;
    tool_calls?: any;
  }> = [
    { role: 'system', content: enrichedSystemMessage },
    ...history.map((message: any) => ({ role: message.role, content: message.content })),
  ];

  if (processedImages && processedImages.length > 0) {
    const imageUrls = processedImages.map(img => img.url);
    const contentParts: any[] = [{
      type: 'text',
      text: `${input.message}\n\n[Image URLs for reference: ${imageUrls.join(', ')}]`,
    }];
    for (const image of processedImages) {
      contentParts.push({ type: 'image_url', image_url: { url: image.url } });
    }
    conversationMessages.push({ role: 'user', content: contentParts });
  } else {
    conversationMessages.push({ role: 'user', content: input.message });
  }

  const content = await runChatPipeline({
    provider: input.provider,
    modelBaseUrl,
    modelId: input.modelId,
    githubToken,
    googleApiKey,
    anthropicApiKey,
    tavilyApiKey,
    user: input.user,
    conversationId: input.conversationId,
    message: input.message,
    locale: input.locale,
    activeSkill,
    activeTools,
    messages: conversationMessages,
    emit,
    keepalive: input.keepalive ?? (() => undefined),
  });

  const savedAssistantMessage = await chatService.saveMessage(input.conversationId, 'assistant', content, { userId: input.user.id });
  if (!savedAssistantMessage.success) {
    throw new ChatMessagePersistenceError('Failed to save assistant message');
  }

  if (activeSkill) {
    try {
      await skillsService.completeSkillUsage(input.conversationId, true, undefined, 0);
    } catch (error) {
      console.error('[ChatExecution] Skill usage tracking failed:', error);
    }
  }

  return {
    conversationId: input.conversationId,
    content,
    events,
  };
}
