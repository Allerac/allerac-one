import { Message, Model } from '../../types';
import { LLMService } from '../llm/llm.service';
import * as chatActions from '@/app/actions/chat';
import * as memoryActions from '@/app/actions/memory';
import * as ragActions from '@/app/actions/rag';
import * as toolActions from '@/app/actions/tools';

interface ChatMessageServiceConfig {
  githubToken: string;
  tavilyApiKey: string;
  userId: string | null;
  selectedModel: string;
  systemMessage: string;
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  MODELS: Model[];
  TOOLS: any[];
  onConversationCreated?: () => void;
}

export class ChatMessageService {
  private config: ChatMessageServiceConfig;

  constructor(config: ChatMessageServiceConfig) {
    this.config = config;
  }

  private async executeTool(toolName: string, toolArgs: any) {
    if (toolName === 'search_web') {
      return await toolActions.executeWebSearch(toolArgs.query, this.config.tavilyApiKey);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  private async createNewConversation(firstMessage: string): Promise<string | null> {
    if (!this.config.userId) return null;

    // Before creating new conversation, try to summarize the current one
    if (this.config.currentConversationId && this.config.githubToken) {
      console.log(`[Memory] Creating new conversation, checking if ${this.config.currentConversationId} should be summarized`);
      try {
        const shouldSummarize = await memoryActions.shouldSummarizeConversation(this.config.currentConversationId, this.config.githubToken);
        console.log(`[Memory] Should summarize ${this.config.currentConversationId}:`, shouldSummarize);

        if (shouldSummarize) {
          console.log(`[Memory] Generating summary for conversation ${this.config.currentConversationId}...`);
          // Generate summary in background
          memoryActions.generateConversationSummary(this.config.currentConversationId, this.config.userId!, this.config.githubToken)
            .then(summary => console.log('[Memory] Summary generated:', summary))
            .catch(err => console.error('[Memory] Failed to generate summary:', err));
        }
      } catch (error) {
        console.error('[Memory] Error in summary generation:', error);
      }
    }

    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    const conversationId = await chatActions.createConversation(this.config.userId, title);

    if (!conversationId) {
      console.error('Error creating conversation');
      return null;
    }

    this.config.setCurrentConversationId(conversationId);

    // Notify that a new conversation was created
    if (this.config.onConversationCreated) {
      this.config.onConversationCreated();
    }

    return conversationId;
  }

  private async saveMessage(conversationId: string, role: string, content: string) {
    const result = await chatActions.saveMessage(conversationId, role, content);

    if (!result.success) {
      console.error('Error saving message:', result.error);
    }
  }

  async sendMessage(inputMessage: string) {
    if (!inputMessage.trim() || !this.config.githubToken) return;

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    const messageContent = inputMessage;
    this.config.setMessages(prev => [...prev, userMessage]);

    try {
      // Create new conversation if needed
      let convId = this.config.currentConversationId;
      if (!convId) {
        convId = await this.createNewConversation(messageContent);
        if (!convId) throw new Error('Failed to create conversation');
      }

      // Save user message
      await this.saveMessage(convId, 'user', messageContent);

      // Step 1: Get conversation memories from past chats
      let conversationMemories = '';
      if (this.config.userId) {
        try {
          // Get recent summaries (exclude current conversation)
          const summaries = await memoryActions.getRecentSummaries(this.config.userId, this.config.githubToken, 3, 4);
          if (summaries && summaries.length > 0) {
            conversationMemories = await memoryActions.formatMemoryContext(summaries, this.config.githubToken);
          }
        } catch (error) {
          console.log('Failed to load conversation memories:', error);
        }
      }

      // Step 2: Search for relevant documents using RAG (filtered by user)
      let relevantContext = '';
      if (this.config.userId) {
        try {
          // Get relevant context from documents owned by this user
          relevantContext = await ragActions.getRelevantContext(messageContent, this.config.userId, this.config.githubToken);
        } catch (error) {
          console.log('No documents available or search failed:', error);
          // Continue without document context
        }
      }

      // Step 3: Build conversation messages with all context
      let systemMessageWithContext = this.config.systemMessage || 'You are a helpful AI assistant. You have access to web search and document knowledge base. Use these tools to provide accurate, up-to-date information. Always search for current information when needed.';

      // Prepend conversation memories if available
      if (conversationMemories) {
        systemMessageWithContext = conversationMemories + '\n\n' + systemMessageWithContext;
      }

      // Append document context if available
      if (relevantContext && !relevantContext.includes('No relevant documents found')) {
        systemMessageWithContext += '\n\n' + relevantContext;
      }

      const conversationMessages: Array<{
        role: string;
        content: string;
        tool_call_id?: string;
        tool_calls?: any;
      }> = [
          {
            role: 'system',
            content: systemMessageWithContext,
          },
          ...this.config.messages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: inputMessage },
        ];

      console.log('🔑 GitHub Token (first 10 chars):', this.config.githubToken?.substring(0, 10));
      console.log('🤖 Selected Model:', this.config.selectedModel);
      console.log('📨 Sending request to LLM API...');

      // Get model configuration
      const currentModel = this.config.MODELS.find(m => m.id === this.config.selectedModel);
      if (!currentModel) {
        throw new Error(`Model ${this.config.selectedModel} not found in configuration`);
      }

      console.log('🔌 Using provider:', currentModel.provider);
      console.log('🌐 Base URL:', currentModel.baseUrl);

      // Use LLM service with model configuration
      const llmService = new LLMService(
        currentModel.provider,
        currentModel.baseUrl!,
        { githubToken: this.config.githubToken }
      );

      let data = await llmService.chatCompletion({
        messages: conversationMessages,
        model: this.config.selectedModel,
        temperature: 0.7,
        max_tokens: 2000,
        tools: this.config.TOOLS,
        tool_choice: 'auto',
      });
      let assistantMessage = data.choices[0].message;

      // Handle tool calls
      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        conversationMessages.push(assistantMessage);

        // Execute all tool calls
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

          try {
            const toolResult = await this.executeTool(toolName, toolArgs);
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

        // Get final response from model
        console.log('🔄 Sending follow-up request after tool execution...');
        data = await llmService.chatCompletion({
          messages: conversationMessages,
          model: this.config.selectedModel,
          temperature: 0.7,
          max_tokens: 2000,
          tools: this.config.TOOLS,
          tool_choice: 'auto',
        });
        assistantMessage = data.choices[0].message;
      }

      const finalMessage: Message = {
        role: 'assistant',
        content: assistantMessage.content,
        timestamp: new Date(),
      };

      this.config.setMessages(prev => [...prev, finalMessage]);

      // Save assistant message
      if (convId) {
        await this.saveMessage(convId, 'assistant', assistantMessage.content);
      }
    } catch (error: any) {
      console.error('❌ Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: error.message,
        timestamp: new Date(),
      };
      this.config.setMessages(prev => [...prev, errorMessage]);
    }
  }
}
