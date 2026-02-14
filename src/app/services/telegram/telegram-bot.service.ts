/**
 * Telegram Bot Service for Allerac One
 *
 * Connects Telegram messages to the Allerac chat pipeline.
 * Uses polling (no webhook server needed).
 */

import TelegramBot from 'node-telegram-bot-api';
import { handleChatMessage, maybeSummarizeConversation, ChatHandlerConfig } from '../chat/chat-handler';
import { UserSettingsService } from '../user/user-settings.service';
import { MODELS } from '../llm/models';
import pool from '../../clients/db';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

interface TelegramBotConfig {
  token: string;
  allowedUsers: number[];
  defaultUserId: string;
}

export class AlleracTelegramBot {
  private bot: TelegramBot;
  private config: TelegramBotConfig;
  private userSettings: UserSettingsService;
  private selectedModels: Map<number, string> = new Map();
  private correctionStates: Map<number, {
    step: 'awaiting_text' | 'awaiting_importance' | 'awaiting_importance_number' | 'awaiting_emotion';
    correctionText?: string;
    importance?: number;
    lastMessageId?: number;
  }> = new Map();

  constructor(config: TelegramBotConfig) {
    this.config = config;
    this.bot = new TelegramBot(config.token, { polling: true });
    this.userSettings = new UserSettingsService();
    this.registerHandlers();
  }

  private isAllowed(userId: number): boolean {
    return this.config.allowedUsers.length === 0 || this.config.allowedUsers.includes(userId);
  }

  private async getOrCreateMapping(chatId: number, userId: number, username?: string) {
    const existing = await pool.query(
      'SELECT * FROM telegram_chat_mapping WHERE telegram_chat_id = $1',
      [chatId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new mapping
    await pool.query(
      `INSERT INTO telegram_chat_mapping (telegram_chat_id, user_id, telegram_user_id, telegram_username)
       VALUES ($1, $2, $3, $4)`,
      [chatId, this.config.defaultUserId, userId, username || null]
    );

    return {
      telegram_chat_id: chatId,
      user_id: this.config.defaultUserId,
      current_conversation_id: null,
      telegram_user_id: userId,
    };
  }

  private async updateConversationId(chatId: number, conversationId: string) {
    await pool.query(
      'UPDATE telegram_chat_mapping SET current_conversation_id = $1, updated_at = NOW() WHERE telegram_chat_id = $2',
      [conversationId, chatId]
    );
  }

  private async getChatConfig(alleracUserId: string, telegramUserId: number): Promise<ChatHandlerConfig> {
    const settings = await this.userSettings.loadUserSettings(alleracUserId);
    const selectedModel = this.selectedModels.get(telegramUserId);

    // Find model config - default to first Ollama model for local use
    const defaultModel = MODELS.find(m => m.provider === 'ollama') || MODELS[0];
    const model = selectedModel ? MODELS.find(m => m.id === selectedModel) : null;
    const activeModel = model || defaultModel;

    // For Ollama models in Docker, use the direct Ollama URL (not the Next.js proxy)
    const baseUrl = activeModel.provider === 'ollama'
      ? OLLAMA_BASE_URL
      : activeModel.baseUrl!;

    return {
      userId: alleracUserId,
      githubToken: settings?.github_token || '',
      tavilyApiKey: settings?.tavily_api_key || '',
      selectedModel: activeModel.id,
      modelProvider: activeModel.provider,
      modelBaseUrl: baseUrl,
      systemMessage: settings?.system_message || 'You are a helpful AI assistant communicating via Telegram. Keep responses concise and well-formatted. Use markdown when helpful.',
    };
  }

  private splitMessage(text: string): string[] {
    if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a natural boundary
      let splitAt = remaining.lastIndexOf('\n', MAX_TELEGRAM_MESSAGE_LENGTH);
      if (splitAt === -1 || splitAt < MAX_TELEGRAM_MESSAGE_LENGTH / 2) {
        splitAt = remaining.lastIndexOf(' ', MAX_TELEGRAM_MESSAGE_LENGTH);
      }
      if (splitAt === -1) {
        splitAt = MAX_TELEGRAM_MESSAGE_LENGTH;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }

  private registerHandlers() {
    // /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId || !this.isAllowed(userId)) {
        await this.bot.sendMessage(chatId, 'Access denied. Your Telegram ID is not authorized.');
        return;
      }

      await this.getOrCreateMapping(chatId, userId, msg.from?.username);

      await this.bot.sendMessage(chatId,
        `*Allerac One* - Your Private AI Agent\n\n` +
        `Send me any message and I'll respond using your AI agent.\n\n` +
        `*Commands:*\n` +
        `/new - Start a new conversation\n` +
        `/model - Switch AI model\n` +
        `/memory - Show recent memories\n` +
        `/save - Save conversation to memory\n` +
        `/correct - Correct AI and memorize\n` +
        `/help - Show this message`,
        { parse_mode: 'Markdown' }
      );
    });

    // /new command
    this.bot.onText(/\/new/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);

      // Summarize old conversation before starting new
      if (mapping.current_conversation_id) {
        const config = await this.getChatConfig(mapping.user_id, userId);
        await maybeSummarizeConversation(mapping.current_conversation_id, mapping.user_id, config.githubToken);
      }

      // Clear current conversation
      await pool.query(
        'UPDATE telegram_chat_mapping SET current_conversation_id = NULL WHERE telegram_chat_id = $1',
        [chatId]
      );

      await this.bot.sendMessage(chatId, 'New conversation started. Send me a message!');
    });

    // /model command
    this.bot.onText(/\/model(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      const requestedModel = match?.[1]?.trim();

      if (requestedModel) {
        const model = MODELS.find(m =>
          m.id === requestedModel ||
          m.name.toLowerCase().includes(requestedModel.toLowerCase())
        );

        if (model) {
          this.selectedModels.set(userId, model.id);
          await this.bot.sendMessage(chatId, `Model switched to: *${model.name}* ${model.icon}`, { parse_mode: 'Markdown' });
        } else {
          await this.bot.sendMessage(chatId, `Model not found. Use /model to see available models.`);
        }
        return;
      }

      // Show available models
      const defaultModelId = (MODELS.find(m => m.provider === 'ollama') || MODELS[0]).id;
      const currentModel = this.selectedModels.get(userId) || defaultModelId;
      const modelList = MODELS
        .map(m => `${m.id === currentModel ? '> ' : '  '}${m.icon} \`${m.id}\` - ${m.name}`)
        .join('\n');

      await this.bot.sendMessage(chatId,
        `*Available Models:*\n\n${modelList}\n\n` +
        `Usage: \`/model model-id\`\n` +
        `Example: \`/model qwen2.5:7b\``,
        { parse_mode: 'Markdown' }
      );
    });

    // /memory command
    this.bot.onText(/\/memory/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);

      try {
        const result = await pool.query(
          `SELECT summary, key_topics, importance_score, created_at
           FROM conversation_summaries
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 5`,
          [mapping.user_id]
        );

        if (result.rows.length === 0) {
          await this.bot.sendMessage(chatId, 'No memories yet. Chat more and I\'ll remember!');
          return;
        }

        const memories = result.rows.map((r, i) => {
          const topics = r.key_topics?.join(', ') || 'general';
          const date = new Date(r.created_at).toLocaleDateString();
          return `*${i + 1}.* (${date}) [${topics}]\n${r.summary}`;
        }).join('\n\n');

        await this.bot.sendMessage(chatId, `*Recent Memories:*\n\n${memories}`, { parse_mode: 'Markdown' });
      } catch (error) {
        await this.bot.sendMessage(chatId, 'Failed to load memories.');
      }
    });

    // /save command - Save current conversation to memory
    this.bot.onText(/\/save/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);

      if (!mapping.current_conversation_id) {
        await this.bot.sendMessage(chatId, 'No active conversation to save. Start chatting first!');
        return;
      }

      try {
        await this.bot.sendMessage(chatId, '🧠 Saving conversation to memory...');

        const config = await this.getChatConfig(mapping.user_id, userId);
        
        // Generate and save summary
        const summary = await maybeSummarizeConversation(
          mapping.current_conversation_id,
          mapping.user_id,
          config.githubToken
        );

        if (summary) {
          const topics = summary.key_topics?.join(', ') || 'general';
          await this.bot.sendMessage(chatId,
            `✅ *Memory Saved!*\n\n` +
            `*Topics:* ${topics}\n` +
            `*Importance:* ${summary.importance_score}/10\n\n` +
            `*Summary:*\n${summary.summary}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await this.bot.sendMessage(chatId, '⚠️ Conversation too short to create a meaningful memory. Chat more and try again!');
        }
      } catch (error) {
        console.error('[Telegram] Error saving memory:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to save memory. Please try again later.');
      }
    });

    // /correct command - Start correction flow
    this.bot.onText(/\/correct$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);

      if (!mapping.current_conversation_id) {
        await this.bot.sendMessage(chatId, 'No active conversation. Start chatting first!');
        return;
      }

      // Initialize correction state
      this.correctionStates.set(chatId, { step: 'awaiting_text' });

      await this.bot.sendMessage(chatId,
        '🔧 *Correction Mode*\n\n' +
        'How should the AI have responded? Please type your correction:',
        { parse_mode: 'Markdown' }
      );
    });

    // Handle callback queries (inline button clicks)
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message?.chat.id;
      const userId = query.from.id;
      
      if (!chatId || !this.isAllowed(userId)) return;

      const data = query.data;
      const state = this.correctionStates.get(chatId);

      if (!state) return;

      if (data?.startsWith('importance_')) {
        const importanceStr = data.split('_')[1];
        
        if (importanceStr === 'custom') {
          // Ask for custom importance value
          state.step = 'awaiting_importance_number';
          this.correctionStates.set(chatId, state);
          
          await this.bot.editMessageText(
            'Type a number from 1 to 10:',
            {
              chat_id: chatId,
              message_id: query.message?.message_id
            }
          );
          await this.bot.answerCallbackQuery(query.id);
          return;
        }
        
        const importance = parseInt(importanceStr);
        state.importance = importance;
        state.step = 'awaiting_emotion';
        this.correctionStates.set(chatId, state);

        await this.bot.editMessageText(
          `✅ Importance: ${importance}/10\n\n` +
          'How did this response make you feel?',
          {
            chat_id: chatId,
            message_id: query.message?.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '😡 Negative', callback_data: 'emotion_-1' },
                  { text: '😐 Neutral', callback_data: 'emotion_0' },
                  { text: '🥰 Positive', callback_data: 'emotion_1' }
                ]
              ]
            }
          }
        );

        await this.bot.answerCallbackQuery(query.id);
      } else if (data?.startsWith('emotion_')) {
        const emotion = parseInt(data.split('_')[1]);
        
        const mapping = await this.getOrCreateMapping(chatId, userId, query.from.username);

        try {
          // Get last AI message
          const messages = await pool.query(
            `SELECT content FROM chat_messages 
             WHERE conversation_id = $1 AND role = 'assistant' 
             ORDER BY created_at DESC LIMIT 1`,
            [mapping.current_conversation_id]
          );

          const lastResponse = messages.rows[0]?.content || 'the previous response';
          const memoryContent = `User preference: When the AI said "${lastResponse.slice(0, 100)}...", the user corrected: "${state.correctionText}" (importance: ${state.importance}, emotion: ${emotion})`;

          // Save to conversation_summaries table
          await pool.query(
            `INSERT INTO conversation_summaries (conversation_id, user_id, summary, importance_score, key_topics, emotion)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              mapping.current_conversation_id,
              mapping.user_id,
              memoryContent,
              state.importance,
              ['user_preference', 'correction'],
              emotion
            ]
          );

          const importanceLabel = (state.importance || 5) >= 7 ? 'High' : (state.importance || 5) >= 4 ? 'Medium' : 'Low';
          const emotionLabel = emotion === -1 ? 'Negative 😡' : emotion === 0 ? 'Neutral 😐' : 'Positive 🥰';

          await this.bot.editMessageText(
            `✅ *Correction Saved!*\n\n` +
            `*Your correction:* ${state.correctionText}\n` +
            `*Importance:* ${state.importance}/10 (${importanceLabel})\n` +
            `*Emotion:* ${emotionLabel}\n\n` +
            `The AI will remember this preference in future conversations.`,
            {
              chat_id: chatId,
              message_id: query.message?.message_id,
              parse_mode: 'Markdown'
            }
          );

          // Clear state
          this.correctionStates.delete(chatId);

          await this.bot.answerCallbackQuery(query.id, { text: 'Saved!' });
        } catch (error) {
          console.error('[Telegram] Error saving correction:', error);
          await this.bot.sendMessage(chatId, '❌ Failed to save correction. Please try again later.');
          this.correctionStates.delete(chatId);
          await this.bot.answerCallbackQuery(query.id);
        }
      }
    });

    // /help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(chatId,
        `*Allerac One - Commands*\n\n` +
        `/new - Start a new conversation\n` +
        `/model - Switch AI model\n` +
        `/model model-id - Switch to specific model\n` +
        `/memory - Show recent memories\n` +
        `/save - Save current conversation to memory\n` +
        `/correct - Correct AI response and memorize\n` +
        `/help - Show this message\n\n` +
        `Just send any text message to chat with your AI agent.`,
        { parse_mode: 'Markdown' }
      );
    });

    // Regular messages
    this.bot.on('message', async (msg) => {
      // Skip commands
      if (msg.text?.startsWith('/')) return;
      if (!msg.text) return;

      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) {
        await this.bot.sendMessage(chatId, 'Access denied.');
        return;
      }

      // Check if user is in correction flow
      const correctionState = this.correctionStates.get(chatId);
      if (correctionState) {
        if (correctionState.step === 'awaiting_text') {
          // Save correction text and ask for importance
          correctionState.correctionText = msg.text;
          correctionState.step = 'awaiting_importance';
          this.correctionStates.set(chatId, correctionState);

          await this.bot.sendMessage(chatId,
            '📊 How important is this correction?',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '1️⃣ Low', callback_data: 'importance_3' },
                    { text: '5️⃣ Medium', callback_data: 'importance_5' },
                    { text: '🔟 High', callback_data: 'importance_8' }
                  ],
                  [
                    { text: 'Custom...', callback_data: 'importance_custom' }
                  ]
                ]
              }
            }
          );
          return;
        } else if (correctionState.step === 'awaiting_importance_number') {
          // User is typing custom importance number
          const num = parseInt(msg.text);
          if (isNaN(num) || num < 1 || num > 10) {
            await this.bot.sendMessage(chatId, '❌ Please type a valid number between 1 and 10:');
            return;
          }

          correctionState.importance = num;
          correctionState.step = 'awaiting_emotion';
          this.correctionStates.set(chatId, correctionState);

          await this.bot.sendMessage(chatId,
            `✅ Importance: ${num}/10\n\n` +
            'How did this response make you feel?',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '😡 Negative', callback_data: 'emotion_-1' },
                    { text: '😐 Neutral', callback_data: 'emotion_0' },
                    { text: '🥰 Positive', callback_data: 'emotion_1' }
                  ]
                ]
              }
            }
          );
          return;
        }
      }

      // Show typing indicator
      await this.bot.sendChatAction(chatId, 'typing');

      try {
        const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);
        const chatConfig = await this.getChatConfig(mapping.user_id, userId);

        const result = await handleChatMessage(
          msg.text,
          mapping.current_conversation_id,
          chatConfig
        );

        // Update conversation mapping if new
        if (result.conversationId !== mapping.current_conversation_id) {
          await this.updateConversationId(chatId, result.conversationId);
        }

        // Send response (split if too long)
        const chunks = this.splitMessage(result.response);
        for (const chunk of chunks) {
          try {
            await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
          } catch {
            // Fallback without markdown if parsing fails
            await this.bot.sendMessage(chatId, chunk);
          }
        }
      } catch (error: any) {
        console.error('[Telegram] Error processing message:', error);
        await this.bot.sendMessage(chatId, `Error: ${error.message || 'Something went wrong. Try again.'}`);
      }
    });
  }

  async start() {
    console.log('[Telegram] Bot started. Waiting for messages...');
    console.log(`[Telegram] Allowed users: ${this.config.allowedUsers.length === 0 ? 'ALL' : this.config.allowedUsers.join(', ')}`);
  }

  async stop() {
    this.bot.stopPolling();
    console.log('[Telegram] Bot stopped.');
  }
}
