'use server';

/**
 * Server Actions for Telegram Bot Configuration
 */

import { TelegramBotConfigService } from '@/app/services/telegram/telegram-bot-config.service';
import { requireCurrentUser } from '@/app/lib/auth-session';

/**
 * Get current user's bot configurations
 */
export async function getUserBotConfigs() {
  try {
    const user = await requireCurrentUser();
    const configs = await TelegramBotConfigService.getUserBotConfigs(user.id);
    return { success: true, configs };
  } catch (error) {
    console.error('[TelegramBotConfig] Error getting bot configs:', error);
    return { success: false, error: 'Failed to load bot configurations' };
  }
}

/**
 * Create a new bot configuration
 */
export async function createBotConfig(
  botName: string,
  botToken: string,
  allowedTelegramIds: number[],
  botUsername?: string
) {
  try {
    const user = await requireCurrentUser();
    // Validate bot token format (should be like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
    if (!botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      return { success: false, error: 'Invalid bot token format' };
    }

    const config = await TelegramBotConfigService.createBotConfig(
      user.id,
      botName,
      botToken,
      allowedTelegramIds,
      botUsername
    );
    
    return { success: true, config };
  } catch (error: unknown) {
    console.error('[TelegramBotConfig] Error creating bot config:', error);
    
    // Handle unique constraint violation
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return { success: false, error: 'A bot with this name already exists' };
    }
    
    return { success: false, error: 'Failed to create bot configuration' };
  }
}

/**
 * Update bot configuration
 */
export async function updateBotConfig(
  botId: string,
  updates: {
    botName?: string;
    botToken?: string;
    botUsername?: string;
    allowedTelegramIds?: number[];
    enabled?: boolean;
  }
) {
  try {
    const user = await requireCurrentUser();
    // Validate bot token format if provided
    if (updates.botToken && !updates.botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      return { success: false, error: 'Invalid bot token format' };
    }

    const config = await TelegramBotConfigService.updateBotConfig(
      botId,
      user.id,
      updates
    );
    
    if (!config) {
      return { success: false, error: 'Bot configuration not found' };
    }
    
    return { success: true, config };
  } catch (error: unknown) {
    console.error('[TelegramBotConfig] Error updating bot config:', error);
    
    // Handle unique constraint violation
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return { success: false, error: 'A bot with this name already exists' };
    }
    
    return { success: false, error: 'Failed to update bot configuration' };
  }
}

/**
 * Toggle bot enabled/disabled
 */
export async function toggleBotEnabled(botId: string) {
  try {
    const user = await requireCurrentUser();
    const config = await TelegramBotConfigService.toggleBotEnabled(botId, user.id);
    
    if (!config) {
      return { success: false, error: 'Bot configuration not found' };
    }
    
    return { success: true, config };
  } catch (error) {
    console.error('[TelegramBotConfig] Error toggling bot:', error);
    return { success: false, error: 'Failed to toggle bot status' };
  }
}

/**
 * Delete bot configuration
 */
export async function deleteBotConfig(botId: string) {
  try {
    const user = await requireCurrentUser();
    const deleted = await TelegramBotConfigService.deleteBotConfig(botId, user.id);
    
    if (!deleted) {
      return { success: false, error: 'Bot configuration not found' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[TelegramBotConfig] Error deleting bot config:', error);
    return { success: false, error: 'Failed to delete bot configuration' };
  }
}

/**
 * Test bot token validity by attempting to get bot info
 */
export async function testBotToken(botToken: string) {
  try {
    await requireCurrentUser();
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      return {
        success: true,
        botInfo: {
          username: data.result.username,
          firstName: data.result.first_name,
          canJoinGroups: data.result.can_join_groups,
          canReadAllGroupMessages: data.result.can_read_all_group_messages,
        }
      };
    } else {
      return { success: false, error: data.description || 'Invalid token' };
    }
  } catch (error) {
    console.error('[TelegramBotConfig] Error testing bot token:', error);
    return { success: false, error: 'Failed to connect to Telegram API' };
  }
}
