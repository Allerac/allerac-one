import { Message, Model } from '../../types';
import { LLMService } from '../llm/llm.service';
import { ChatSupabaseService } from '../database/supabase.service';
import { SupabaseClient } from '@supabase/supabase-js';

interface ChatMessageServiceConfig {
  supabase: SupabaseClient;
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
}

export class ChatMessageService {
  private config: ChatMessageServiceConfig;
  private chatService: ChatSupabaseService;

  constructor(config: ChatMessageServiceConfig) {
    this.config = config;
    this.chatService = new ChatSupabaseService(config.supabase);
  }

  private async executeTool(toolName: string, toolArgs: any) {
    if (toolName === 'search_web') {
      const { SearchWebTool } = await import('@/app/tools/search-web.tool');
      const searchTool = new SearchWebTool(this.config.supabase, this.config.tavilyApiKey);
      return await searchTool.execute(toolArgs);
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  private async createNewConversation(firstMessage: string): Promise<string | null> {
    if (!this.config.userId) return null;

    // Before creating new conversation, try to summarize the current one
    if (this.config.currentConversationId && this.config.githubToken) {
      console.log(`[Memory] Creating new conversation, checking if ${this.config.currentConversationId} should be summarized`);
      try {
        const { ConversationMemoryService } = await import('@/app/services/memory/conversation-memory.service');
        const memoryService = new ConversationMemoryService(this.config.supabase, this.config.githubToken);
        
        const shouldSummarize = await memoryService.shouldSummarizeConversation(this.config.currentConversationId);
        console.log(`[Memory] Should summarize ${this.config.currentConversationId}:`, shouldSummarize);
        
        if (shouldSummarize) {
          console.log(`[Memory] Generating summary for conversation ${this.config.currentConversationId}...`);
          // Generate summary in background
          memoryService.generateConversationSummary(this.config.currentConversationId, this.config.userId!)
            .then(summary => console.log('[Memory] Summary generated:', summary))
            .catch(err => console.error('[Memory] Failed to generate summary:', err));
        }
      } catch (error) {
        console.error('[Memory] Error in summary generation:', error);
      }
    }

    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    const { data, error } = await this.config.supabase
      .from('chat_conversations')
      .insert([{ user_id: this.config.userId, title }])
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }

    this.config.setCurrentConversationId(data.id);
    return data.id;
  }

  private async saveMessage(conversationId: string, role: string, content: string) {
    const { error } = await this.config.supabase
      .from('chat_messages')
      .insert([{ conversation_id: conversationId, role, content }]);

    if (error) {
      console.error('Error saving message:', error);
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
          const { ConversationMemoryService } = await import('@/app/services/memory/conversation-memory.service');
          const memoryService = new ConversationMemoryService(this.config.supabase, this.config.githubToken);
          
          // Get recent summaries (exclude current conversation)
          const summaries = await memoryService.getRecentSummaries(this.config.userId, 3, 4);
          if (summaries.length > 0) {
            conversationMemories = memoryService.formatMemoryContext(summaries);
          }
        } catch (error) {
          console.log('Failed to load conversation memories:', error);
        }
      }

      // Step 2: Search for relevant documents using RAG
      let relevantContext = '';
      try {
        const { EmbeddingService } = await import('@/app/services/rag/embedding.service');
        const { VectorSearchService } = await import('@/app/services/rag/vector-search.service');
        
        const embeddingService = new EmbeddingService(this.config.githubToken);
        const vectorSearchService = new VectorSearchService(this.config.supabase, embeddingService);
        
        // Get relevant context from documents
        relevantContext = await vectorSearchService.getRelevantContext(messageContent, {
          limit: 3,
          similarityThreshold: 0.6,
        });
      } catch (error) {
        console.log('No documents available or search failed:', error);
        // Continue without document context
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
