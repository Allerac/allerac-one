/**
 * Multi-Bot Entry Point for Allerac Telegram Bots
 * 
 * Reads configuration from database and starts/stops bots dynamically with hot reload
 */

import { AlleracTelegramBot } from './src/app/services/telegram/telegram-bot.service';
import { TelegramBotConfigService } from './src/app/services/telegram/telegram-bot-config.service';

interface RunningBot {
  id: string;
  name: string;
  instance: AlleracTelegramBot;
}

const runningBots: Map<string, RunningBot> = new Map();
let lastUpdateTimestamp: Date | null = null;

/**
 * Start a bot instance
 */
async function startBot(config: any): Promise<void> {
  try {
    console.log(`[Telegram] Starting bot: ${config.botName}`);
    console.log(`[Telegram]   - User: ${config.userId}`);
    console.log(`[Telegram]   - Allowed IDs: ${config.allowedTelegramIds.join(', ') || 'ALL'}`);
    
    const bot = new AlleracTelegramBot({
      token: config.botToken,
      allowedUsers: config.allowedTelegramIds || [],
      defaultUserId: config.userId
    });

    runningBots.set(config.id, {
      id: config.id,
      name: config.botName,
      instance: bot
    });

    console.log(`[Telegram] ✓ Bot "${config.botName}" started successfully`);
  } catch (error) {
    console.error(`[Telegram] ✗ Failed to start bot "${config.botName}":`, error);
  }
}

/**
 * Stop a bot instance
 */
async function stopBot(botId: string): Promise<void> {
  const bot = runningBots.get(botId);
  if (!bot) return;

  try {
    console.log(`[Telegram] Stopping bot: ${bot.name}`);
    // Note: node-telegram-bot-api doesn't have a clean stop method
    // The bot will naturally stop responding when we remove it from the map
    runningBots.delete(botId);
    console.log(`[Telegram] ✓ Bot "${bot.name}" stopped`);
  } catch (error) {
    console.error(`[Telegram] ✗ Error stopping bot "${bot.name}":`, error);
  }
}

/**
 * Check for configuration changes and reload bots
 */
async function checkForUpdates(): Promise<void> {
  try {
    const latestTimestamp = await TelegramBotConfigService.getLastUpdateTimestamp();
    
    // First run or no configs yet
    if (!lastUpdateTimestamp) {
      lastUpdateTimestamp = latestTimestamp;
      await loadAllBots();
      return;
    }

    // Check if there were updates
    if (latestTimestamp && latestTimestamp > lastUpdateTimestamp) {
      console.log('[Telegram] Configuration changes detected, reloading bots...');
      lastUpdateTimestamp = latestTimestamp;
      await loadAllBots();
    }
  } catch (error) {
    console.error('[Telegram] Error checking for updates:', error);
  }
}

/**
 * Load all enabled bots from database
 */
async function loadAllBots(): Promise<void> {
  try {
    const configs = await TelegramBotConfigService.getAllEnabledBotConfigs();
    
    // Stop bots that are no longer enabled or were removed
    const currentBotIds = new Set(configs.map(c => c.id));
    for (const [botId, _] of runningBots) {
      if (!currentBotIds.has(botId)) {
        await stopBot(botId);
      }
    }

    // Start new bots or restart existing ones
    for (const config of configs) {
      if (runningBots.has(config.id)) {
        // Bot already running - could check if config changed and restart if needed
        continue;
      }
      await startBot(config);
    }

    console.log(`[Telegram] Currently running: ${runningBots.size} bot(s)`);
  } catch (error) {
    console.error('[Telegram] Error loading bots:', error);
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('[Telegram] Starting Allerac Multi-Bot Manager with Database Hot Reload...');

  // Initial load
  await loadAllBots();

  if (runningBots.size === 0) {
    console.log('[Telegram] No bots configured yet. Waiting for configurations...');
  }

  // Set up hot reload - check every 10 seconds
  setInterval(checkForUpdates, 10000);

  console.log('[Telegram] Hot reload enabled (checking every 10s)');
  console.log('[Telegram] Multi-Bot Manager is running');
}

// Start the manager
main().catch(error => {
  console.error('[Telegram] Fatal error:', error);
  process.exit(1);
});
