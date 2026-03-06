/**
 * Telegram Bot Service for Allerac One
 *
 * Connects Telegram messages to the Allerac chat pipeline.
 * Uses polling (no webhook server needed).
 */

import TelegramBot from 'node-telegram-bot-api';
import { handleChatMessage, maybeSummarizeConversation, ChatHandlerConfig, ChatImageAttachment } from '../chat/chat-handler';
import { UserSettingsService } from '../user/user-settings.service';
import { ConversationMemoryService } from '../memory/conversation-memory.service';
import { skillsService } from '../skills/skills.service';
import { MODELS } from '../llm/models';
import pool from '../../clients/db';
import https from 'https';
import http from 'http';

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
    this.bot = new TelegramBot(config.token, {
      polling: {
        params: {
          allowed_updates: ['message', 'edited_message', 'callback_query', 'message_reaction'],
        },
      },
    });
    this.userSettings = new UserSettingsService();
    this.patchAsyncHandlers();
    this.registerHandlers();
  }

  /**
   * Monkey-patch bot.on and bot.onText so that any async handler that throws
   * is caught and logged instead of becoming an unhandled promise rejection.
   * Applied once before registerHandlers() so every handler is covered.
   */
  private patchAsyncHandlers() {
    const origOn = this.bot.on.bind(this.bot);
    const origOnText = this.bot.onText.bind(this.bot);

    (this.bot as any).on = (event: string, listener: (...args: any[]) => any) =>
      origOn(event as any, (...args: any[]) => {
        const r = listener(...args);
        if (r && typeof r.catch === 'function') {
          r.catch((err: unknown) => console.error(`[Telegram] Unhandled error in '${event}' handler:`, err));
        }
      });

    (this.bot as any).onText = (regexp: RegExp, callback: (...args: any[]) => any) =>
      origOnText(regexp, (msg: any, match: any) => {
        const r = callback(msg, match);
        if (r && typeof r.catch === 'function') {
          r.catch((err: unknown) => console.error('[Telegram] Unhandled error in onText handler:', err));
        }
      });
  }

  private isAllowed(userId: number): boolean {
    return this.config.allowedUsers.length === 0 || this.config.allowedUsers.includes(userId);
  }

  /**
   * Returns the Allerac user_id for a given Telegram user.
   * Each unique Telegram user gets their own isolated Allerac account so that
   * conversations, memories, and corrections are never shared across different
   * Telegram users who happen to share the same bot.
   */
  private async getOrCreateVirtualUser(telegramUserId: number, username?: string): Promise<string> {
    // Re-use the same Allerac user if this Telegram user already has any mapping
    const existing = await pool.query(
      'SELECT user_id FROM telegram_chat_mapping WHERE telegram_user_id = $1 LIMIT 1',
      [telegramUserId]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0].user_id;
    }

    // First time this Telegram user talks to the bot – create a dedicated virtual account
    const email = `telegram_${telegramUserId}@telegram.bot.local`;
    const displayName = username ? `Telegram: @${username}` : `Telegram User ${telegramUserId}`;

    const result = await pool.query(
      `INSERT INTO users (email, name)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [email, displayName]
    );

    console.log(`[Telegram] Created virtual user ${result.rows[0].id} for Telegram user ${telegramUserId} (@${username ?? 'unknown'})`);
    return result.rows[0].id;
  }

  private async getOrCreateMapping(chatId: number, userId: number, username?: string) {
    const existing = await pool.query(
      'SELECT * FROM telegram_chat_mapping WHERE telegram_chat_id = $1',
      [chatId]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Each Telegram user gets their own isolated Allerac account
    const alleracUserId = await this.getOrCreateVirtualUser(userId, username);

    // Create new mapping
    await pool.query(
      `INSERT INTO telegram_chat_mapping (telegram_chat_id, user_id, telegram_user_id, telegram_username)
       VALUES ($1, $2, $3, $4)`,
      [chatId, alleracUserId, userId, username || null]
    );

    return {
      telegram_chat_id: chatId,
      user_id: alleracUserId,
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

  private async getBotConfig(chatId: number): Promise<any | null> {
    try {
      // In the current setup, we use telegram_chat_mapping
      // For now, return a temporary config or extend the schema later
      const result = await pool.query(
        `SELECT tbc.* FROM telegram_bot_configs tbc
         JOIN telegram_chat_mapping tcm ON tcm.user_id = tbc.user_id
         WHERE tcm.telegram_chat_id = $1
         LIMIT 1`,
        [chatId]
      );
      
      if (result.rows.length === 0) {
        // Try to get any bot config for this user
        const mapping = await pool.query(
          'SELECT user_id FROM telegram_chat_mapping WHERE telegram_chat_id = $1',
          [chatId]
        );
        
        if (mapping.rows.length === 0) return null;
        
        const botResult = await pool.query(
          'SELECT * FROM telegram_bot_configs WHERE user_id = $1 LIMIT 1',
          [mapping.rows[0].user_id]
        );
        
        return botResult.rows[0] || null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('[TelegramBot] Error getting bot config:', error);
      return null;
    }
  }

  private async getChatConfig(alleracUserId: string, telegramUserId: number, botId?: string): Promise<ChatHandlerConfig> {
    let settings = await this.userSettings.loadUserSettings(alleracUserId);

    // Virtual Telegram users have no API keys of their own – inherit them from the
    // bot owner (defaultUserId) so that LLM calls continue to work.
    if (!settings?.github_token && alleracUserId !== this.config.defaultUserId) {
      const ownerSettings = await this.userSettings.loadUserSettings(this.config.defaultUserId);
      if (ownerSettings) {
        settings = {
          ...ownerSettings,
          // Prefer any user-specific overrides (e.g. system_message) if present
          ...(settings || {}),
          // Always use the bot owner's API credentials
          github_token: ownerSettings.github_token,
          tavily_api_key: ownerSettings.tavily_api_key,
        };
      }
    }

    const selectedModel = this.selectedModels.get(telegramUserId);

    // Find model config - default to gpt-4o for vision support
    const defaultModel = MODELS.find(m => m.id === 'gpt-4o') || MODELS[0];
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
      botId: botId,
    };
  }

  /** Escape characters that break Telegram Markdown v1 parsing. */
  private escapeMd(text: string): string {
    return text.replace(/[_*`\[]/g, '\\$&');
  }

  /** Wrap an async handler so errors never become unhandled rejections. */
  private safe<T extends unknown[]>(fn: (...args: T) => Promise<void>): (...args: T) => void {
    return (...args: T) => {
      fn(...args).catch((err) => console.error('[Telegram] Error in handler:', err));
    };
  }

  /** Send a message, trying Markdown first and falling back to plain text. */
  private async safeSend(chatId: number, text: string): Promise<TelegramBot.Message> {
    try {
      return await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch {
      return await this.bot.sendMessage(chatId, text);
    }
  }

  private async saveBotMessage(chatId: number, messageId: number, userId: string, conversationId: string | null) {
    try {
      await pool.query(
        `INSERT INTO telegram_bot_messages (chat_id, message_id, user_id, conversation_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (chat_id, message_id) DO NOTHING`,
        [chatId, messageId, userId, conversationId]
      );
    } catch (err) {
      console.error('[Telegram] Failed to save bot message mapping:', err);
    }
  }

  private async recordReactionFeedback(userId: string, conversationId: string, emoji: string, sentiment: 1 | -1) {
    const summary = sentiment === 1
      ? `User reacted ${emoji} (positive) to this AI response — the response was helpful or well-received.`
      : `User reacted ${emoji} (negative) to this AI response — the response was unhelpful or unwanted.`;
    const importance = sentiment === 1 ? 6 : 7;

    await pool.query(
      `INSERT INTO conversation_summaries
         (conversation_id, user_id, summary, importance_score, key_topics, emotion, message_count)
       VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [conversationId, userId, summary, importance, ['user_feedback', 'reaction'], sentiment]
    );
    console.log(`[Telegram] Recorded ${sentiment > 0 ? 'positive' : 'negative'} reaction feedback for user ${userId}`);
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

  /**
   * Download file from Telegram servers
   */
  private async downloadTelegramFile(fileId: string): Promise<Buffer> {
    try {
      const fileLink = await this.bot.getFileLink(fileId);
      
      return new Promise<Buffer>((resolve, reject) => {
        const protocol = fileLink.startsWith('https') ? https : http;
        protocol.get(fileLink, (response) => {
          const chunks: Buffer[] = [];
          
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        }).on('error', reject);
      });
    } catch (error) {
      console.error('[Telegram] Error downloading file:', error);
      throw error;
    }
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
        `/conversations - List your conversations\n` +
        `/switch - Switch to a conversation\n` +
        `/model - Switch AI model\n` +
        `/memory - Show recent memories\n` +
        `/save - Save conversation to memory\n` +
        `/correct - Correct AI and memorize\n` +
        `/help - Show this message\n\n` +
        `*Features:*\n` +
        `📝 Text chat\n` +
        `📷 Image analysis (with GPT-4o)\n` +
        `🔍 Web search\n` +
        `🧠 Conversation memory`,
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
        `Example: \`/model qwen3.5:2b,qwen3.5:0.8b\``,
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
        
        // Generate and save summary directly
        const memoryService = new ConversationMemoryService(config.githubToken);
        const summary = await memoryService.generateConversationSummary(
          mapping.current_conversation_id,
          mapping.user_id
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

    // /conversations command - List all user conversations
    this.bot.onText(/\/conversations/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);

      try {
        const result = await pool.query(
          `SELECT id, title, updated_at 
           FROM chat_conversations 
           WHERE user_id = $1 
           ORDER BY updated_at DESC 
           LIMIT 20`,
          [mapping.user_id]
        );

        if (result.rows.length === 0) {
          await this.bot.sendMessage(chatId, 'No conversations yet. Start chatting to create one!');
          return;
        }

        const conversations = result.rows.map((r, i) => {
          const date = new Date(r.updated_at).toLocaleDateString();
          const isActive = r.id === mapping.current_conversation_id ? '▶️ ' : '';
          const idPreview = r.id ? r.id.substring(0, Math.min(8, r.id.length)) : 'unknown';
          return `${isActive}*${i + 1}.* ${this.escapeMd(r.title)}\n   _${date}_ • \`${idPreview}\``;
        }).join('\n\n');

        await this.bot.sendMessage(chatId, 
          `*Your Conversations:*\n\n${conversations}\n\n` +
          `Use \`/switch <number>\` to switch to a conversation.\n` +
          `Example: \`/switch 1\``,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('[Telegram] Error loading conversations:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to load conversations.');
      }
    });

    // /switch command - Switch to a specific conversation
    this.bot.onText(/\/switch(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);
      const input = match?.[1]?.trim();

      if (!input) {
        await this.bot.sendMessage(chatId, 
          'Usage: `/switch <number>` or `/switch <conversation-id>`\n\n' +
          'Use `/conversations` to see available conversations.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      try {
        let conversationId: string | null = null;

        // Check if input is a number (conversation list index)
        const index = parseInt(input, 10);
        if (!isNaN(index) && index > 0) {
          // Get conversation by index from the list
          const result = await pool.query(
            `SELECT id, title 
             FROM chat_conversations 
             WHERE user_id = $1 
             ORDER BY updated_at DESC 
             LIMIT 1 OFFSET $2`,
            [mapping.user_id, index - 1]
          );

          if (result.rows.length > 0) {
            conversationId = result.rows[0].id;
          }
        } else {
          // Try to use input as conversation ID (UUID or partial UUID)
          const result = await pool.query(
            `SELECT id, title 
             FROM chat_conversations 
             WHERE user_id = $1 AND (id::text = $2 OR id::text LIKE $3)
             LIMIT 1`,
            [mapping.user_id, input, `${input}%`]
          );

          if (result.rows.length > 0) {
            conversationId = result.rows[0].id;
          }
        }

        if (!conversationId) {
          await this.bot.sendMessage(chatId, 
            `❌ Conversation not found.\n\n` +
            `Use \`/conversations\` to see your available conversations.`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // Summarize old conversation before switching
        if (mapping.current_conversation_id && mapping.current_conversation_id !== conversationId) {
          const config = await this.getChatConfig(mapping.user_id, userId);
          await maybeSummarizeConversation(mapping.current_conversation_id, mapping.user_id, config.githubToken);
        }

        // Update the current conversation
        await this.updateConversationId(chatId, conversationId);

        // Get conversation details – always verify ownership
        const convResult = await pool.query(
          'SELECT title FROM chat_conversations WHERE id = $1 AND user_id = $2',
          [conversationId, mapping.user_id]
        );

        if (convResult.rows.length === 0) {
          await this.bot.sendMessage(chatId, '❌ Conversation not found. It may have been deleted.');
          return;
        }

        await this.bot.sendMessage(chatId,
          `✅ Switched to: *${this.escapeMd(convResult.rows[0].title)}*\n\n` +
          `Continue your conversation or use \`/new\` to start fresh.`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('[Telegram] Error switching conversation:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to switch conversation. Please try again.');
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
            `INSERT INTO conversation_summaries (conversation_id, user_id, summary, importance_score, key_topics, emotion, message_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              mapping.current_conversation_id,
              mapping.user_id,
              memoryContent,
              state.importance,
              ['user_preference', 'correction'],
              emotion,
              0 // message_count for manual corrections
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

    // Reaction handler
    this.bot.on('message_reaction', async (reaction: any) => {
      try {
        const chatId: number = reaction.chat.id;
        const messageId: number = reaction.message_id;
        const newReactions: any[] = reaction.new_reaction || [];
        const oldReactions: any[] = reaction.old_reaction || [];

        // Only handle reactions to bot messages we know about
        const row = await pool.query(
          'SELECT user_id, conversation_id FROM telegram_bot_messages WHERE chat_id = $1 AND message_id = $2',
          [chatId, messageId]
        );
        if (row.rows.length === 0 || !row.rows[0].conversation_id) return;

        const { user_id, conversation_id } = row.rows[0];

        // Compute which emojis were added vs removed
        const oldEmojis = new Set(oldReactions.map((r: any) => r.emoji));
        const added = newReactions.filter((r: any) => !oldEmojis.has(r.emoji));

        const POSITIVE = new Set(['👍', '❤️', '🎉', '🔥', '🥰', '👏', '💯', '🫡']);
        const NEGATIVE = new Set(['👎', '💩']);

        for (const r of added) {
          const emoji: string = r.emoji;
          if (POSITIVE.has(emoji)) {
            await this.recordReactionFeedback(user_id, conversation_id, emoji, 1);
          } else if (NEGATIVE.has(emoji)) {
            await this.recordReactionFeedback(user_id, conversation_id, emoji, -1);
          }
        }
      } catch (err) {
        console.error('[Telegram] Error processing reaction:', err);
      }
    });

    // /help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) return;

      await this.safeSend(chatId,
        `*Allerac One - Commands*\n\n` +
        `/new - Start a new conversation\n` +
        `/conversations - List your conversations\n` +
        `/switch <number> - Switch to a conversation\n` +
        `/model - Switch AI model\n` +
        `/model model-id - Switch to specific model\n` +
        `/skills - List available skills\n` +
        `/skill <name> - Activate a skill\n` +
        `/skill_info - Show current skill details\n` +
        `/memory - Show recent memories\n` +
        `/save - Save current conversation to memory\n` +
        `/correct - Correct AI response and memorize\n` +
        `/help - Show this message\n\n` +
        `*Features:*\n` +
        `📝 Text chat\n` +
        `📷 Image analysis (with GPT-4o)\n` +
        `🔍 Web search\n` +
        `🧠 Conversation memory`
      );
    });

    // /skills - List available skills
    this.bot.onText(/^\/skills$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) {
        await this.bot.sendMessage(chatId, 'Access denied.');
        return;
      }

      try {
        const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);
        const botConfig = await this.getBotConfig(chatId);
        
        console.log('[TelegramBot] /skills - botConfig:', botConfig?.id, botConfig?.botName);
        
        if (!botConfig) {
          await this.bot.sendMessage(chatId, 'Bot not configured. Please set up your bot first.');
          return;
        }

        const skills = await skillsService.getBotSkills(botConfig.id);
        
        console.log('[TelegramBot] /skills - skills loaded:', skills.length, skills.map(s => s.name));
        
        const activeSkill = mapping.current_conversation_id 
          ? await skillsService.getActiveSkill(mapping.current_conversation_id)
          : null;

        if (skills.length === 0) {
          await this.bot.sendMessage(chatId,
            '📚 No skills assigned yet.\n\n' +
            'Skills can be assigned in the web interface.',
            { parse_mode: 'Markdown' }
          );
          return;
        }

        const skillList = skills.map((s: any) => {
          const isActive = activeSkill && s.id === activeSkill.id;
          const icon = isActive ? '▶️' : '🎯';
          return `${icon} \`${s.name}\` - ${s.display_name}`;
        }).join('\n');

        await this.bot.sendMessage(chatId,
          `*Available Skills:*\n\n${skillList}\n\n` +
          `Usage: \`/skill <skill-name>\`\n` +
          `Example: \`/skill code-reviewer\``,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('[TelegramBot] Error listing skills:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to load skills.');
      }
    });

    // /skill <name> - Activate specific skill
    this.bot.onText(/^\/skill\s+(.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) {
        await this.bot.sendMessage(chatId, 'Access denied.');
        return;
      }

      const skillName = match?.[1]?.trim();
      if (!skillName) {
        await this.bot.sendMessage(chatId, 'Usage: `/skill <skill-name>`', { parse_mode: 'Markdown' });
        return;
      }

      try {
        const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);
        const botConfig = await this.getBotConfig(chatId);
        
        if (!botConfig) {
          await this.bot.sendMessage(chatId, 'Bot not configured.');
          return;
        }

        // Find skill
        const skill = await skillsService.getSkillByName(skillName, mapping.user_id);
        
        if (!skill) {
          await this.bot.sendMessage(chatId,
            `❌ Skill "${skillName}" not found.\n\nUse /skills to see available skills.`
          );
          return;
        }

        // Check if skill is assigned to bot
        const botSkills = await skillsService.getBotSkills(botConfig.id);
        const isAssigned = botSkills.some((s: any) => s.id === skill.id);

        if (!isAssigned) {
          await this.bot.sendMessage(chatId,
            `❌ Skill "${skill.display_name}" is not assigned to this bot.\n\n` +
            `Assign skills in the web interface.`
          );
          return;
        }

        // Create conversation if needed
        let conversationId = mapping.current_conversation_id;
        if (!conversationId) {
          const result = await pool.query(
            'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id',
            [mapping.user_id, `Telegram: ${skill.display_name}`]
          );
          conversationId = result.rows[0].id;
          await this.updateConversationId(chatId, conversationId);
        }

        // Activate skill
        const previousSkill = await skillsService.getActiveSkill(conversationId);
        await skillsService.activateSkill(
          skill.id,
          conversationId,
          mapping.user_id,
          'command',
          `/skill ${skillName}`,
          botConfig.id
        );

        const switchMsg = previousSkill 
          ? `Switched from "${previousSkill.display_name}" to "${skill.display_name}"`
          : `Activated "${skill.display_name}"`;

        await this.bot.sendMessage(chatId,
          `🎯 ${switchMsg}!\n\n${skill.description}`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('[TelegramBot] Error activating skill:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to activate skill.');
      }
    });

    // /skill_info - Show current skill details
    this.bot.onText(/^\/skill_info$/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) {
        await this.bot.sendMessage(chatId, 'Access denied.');
        return;
      }

      try {
        const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);
        
        if (!mapping.current_conversation_id) {
          await this.bot.sendMessage(chatId, 'No active conversation. Start chatting to see the active skill!');
          return;
        }

        const skill = await skillsService.getActiveSkill(mapping.current_conversation_id);
        
        if (!skill) {
          await this.bot.sendMessage(chatId, 'No skill currently active. Use /skills to select one.');
          return;
        }

        // Get usage stats
        const stats = await skillsService.getSkillStats(skill.id, mapping.user_id);
        
        const learningStatus = skill.learning_enabled ? '✅ Yes (adapts from corrections)' : '❌ No';
        const ragStatus = skill.rag_integration ? '✅ Yes (searches your documents)' : '❌ No';

        await this.bot.sendMessage(chatId,
          `🎯 *Current Skill*\n\n` +
          `*Name:* ${skill.display_name}\n` +
          `*Description:* ${skill.description}\n` +
          `*Category:* ${skill.category}\n\n` +
          `*Features:*\n` +
          `🧠 Learning: ${learningStatus}\n` +
          `📄 RAG Integration: ${ragStatus}\n\n` +
          `*Your Usage:*\n` +
          `📊 Times used: ${stats.count}\n` +
          `⭐ Average rating: ${stats.avgRating.toFixed(1)}/5.0\n` +
          `✅ Success rate: ${stats.successRate}%\n\n` +
          `Use /skills to switch to another skill.`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('[TelegramBot] Error getting skill info:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to load skill information.');
      }
    });

    // Regular messages
    this.bot.on('message', async (msg) => {
      try {
      // Skip commands
      if (msg.text?.startsWith('/')) return;

      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      if (!userId || !this.isAllowed(userId)) {
        await this.bot.sendMessage(chatId, 'Access denied.');
        return;
      }

      // Handle photos
      if (msg.photo && msg.photo.length > 0) {
        await this.handlePhotoMessage(msg);
        return;
      }

      // Handle documents (PDFs, images, etc)
      if (msg.document) {
        await this.handleDocumentMessage(msg);
        return;
      }

      // Regular text messages
      if (!msg.text) return;

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
        const botConfig = await this.getBotConfig(chatId);
        const chatConfig = await this.getChatConfig(mapping.user_id, userId, botConfig?.id);

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
        let lastSentMessageId: number | null = null;
        for (const chunk of chunks) {
          const sent = await this.safeSend(chatId, chunk);
          lastSentMessageId = sent.message_id;
        }
        // Track the last bot message so reactions can be linked
        if (lastSentMessageId !== null) {
          await this.saveBotMessage(chatId, lastSentMessageId, mapping.user_id, result.conversationId);
        }
      } catch (error: any) {
        console.error('[Telegram] Error processing message:', error);
        try {
          await this.bot.sendMessage(chatId, `Error: ${error.message || 'Something went wrong. Try again.'}`);
        } catch (sendErr) {
          console.error('[Telegram] Failed to send error message:', sendErr);
        }
      }
      } catch (err) {
        console.error('[Telegram] Unhandled error in message handler:', err);
      }
    });
  }

  /**
   * Handle photo messages
   */
  private async handlePhotoMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;

    try {
      await this.bot.sendChatAction(chatId, 'typing');

      // Get highest quality photo
      const photo = msg.photo![msg.photo!.length - 1];
      const imageData = await this.downloadTelegramFile(photo.file_id);

      const imageAttachment: ChatImageAttachment = {
        data: imageData,
        mimeType: 'image/jpeg',
        filename: `photo_${Date.now()}.jpg`
      };

      const caption = msg.caption || 'What do you see in this image?';
      
      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);
      const botConfig = await this.getBotConfig(chatId);
      const chatConfig = await this.getChatConfig(mapping.user_id, userId, botConfig?.id);

      // Check if model supports vision
      const model = MODELS.find(m => m.id === chatConfig.selectedModel);
      if (model && !model.id.includes('gpt-4o') && !model.id.includes('gpt-4-turbo')) {
        await this.bot.sendMessage(chatId, 
          '⚠️ Current model does not support image analysis.\n\n' +
          'Use `/model gpt-4o` for vision capabilities.'
        );
        return;
      }

      const result = await handleChatMessage(
        caption,
        mapping.current_conversation_id,
        chatConfig,
        [imageAttachment]
      );

      // Update conversation mapping if new
      if (result.conversationId !== mapping.current_conversation_id) {
        await this.updateConversationId(chatId, result.conversationId);
      }

      // Send response
      const chunks = this.splitMessage(result.response);
      let lastSentMessageId: number | null = null;
      for (const chunk of chunks) {
        const sent = await this.safeSend(chatId, chunk);
        lastSentMessageId = sent.message_id;
      }
      // Track the last bot message so reactions can be linked
      if (lastSentMessageId !== null) {
        await this.saveBotMessage(chatId, lastSentMessageId, mapping.user_id, result.conversationId);
      }
    } catch (error: any) {
      console.error('[Telegram] Error processing photo:', error);
      await this.bot.sendMessage(chatId, `❌ Error processing image: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Handle document messages (images, PDFs, etc)
   */
  private async handleDocumentMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    if (!userId) return;

    try {
      const document = msg.document!;
      const mimeType = document.mime_type || 'application/octet-stream';

      // Only handle images for now
      if (!mimeType.startsWith('image/')) {
        await this.bot.sendMessage(chatId, 
          '⚠️ Currently only image files are supported.\n\n' +
          'Send images as photos or image files (JPG, PNG, etc).'
        );
        return;
      }

      await this.bot.sendChatAction(chatId, 'typing');

      const imageData = await this.downloadTelegramFile(document.file_id);

      const imageAttachment: ChatImageAttachment = {
        data: imageData,
        mimeType: mimeType,
        filename: document.file_name || `document_${Date.now()}`
      };

      const caption = msg.caption || 'What do you see in this image?';
      
      const mapping = await this.getOrCreateMapping(chatId, userId, msg.from?.username);
      const botConfig = await this.getBotConfig(chatId);
      const chatConfig = await this.getChatConfig(mapping.user_id, userId, botConfig?.id);

      // Check if model supports vision
      const model = MODELS.find(m => m.id === chatConfig.selectedModel);
      if (model && !model.id.includes('gpt-4o') && !model.id.includes('gpt-4-turbo')) {
        await this.bot.sendMessage(chatId, 
          '⚠️ Current model does not support image analysis.\n\n' +
          'Use `/model gpt-4o` for vision capabilities.'
        );
        return;
      }

      const result = await handleChatMessage(
        caption,
        mapping.current_conversation_id,
        chatConfig,
        [imageAttachment]
      );

      // Update conversation mapping if new
      if (result.conversationId !== mapping.current_conversation_id) {
        await this.updateConversationId(chatId, result.conversationId);
      }

      // Send response
      const chunks = this.splitMessage(result.response);
      let lastSentMessageId: number | null = null;
      for (const chunk of chunks) {
        const sent = await this.safeSend(chatId, chunk);
        lastSentMessageId = sent.message_id;
      }
      // Track the last bot message so reactions can be linked
      if (lastSentMessageId !== null) {
        await this.saveBotMessage(chatId, lastSentMessageId, mapping.user_id, result.conversationId);
      }
    } catch (error: any) {
      console.error('[Telegram] Error processing document:', error);
      await this.bot.sendMessage(chatId, `❌ Error processing document: ${error.message || 'Unknown error'}`);
    }
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
