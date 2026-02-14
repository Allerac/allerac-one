/**
 * Allerac One - Telegram Bot Entry Point
 *
 * Standalone process that connects Telegram to the Allerac chat pipeline.
 * Runs in its own Docker container alongside the main app.
 *
 * Token sources (in order of priority):
 *   1. TELEGRAM_BOT_TOKEN env var (backwards compatible)
 *   2. telegram_bot_token in user_settings DB table (configured via web UI)
 *
 * If no token is found, the bot polls the DB every 10 seconds until one appears.
 *
 * Required env vars:
 *   DATABASE_URL           - PostgreSQL connection string
 *   ENCRYPTION_KEY         - For decrypting stored API keys
 *
 * Optional env vars:
 *   TELEGRAM_BOT_TOKEN     - Bot token from @BotFather (alternative to web UI config)
 *   TELEGRAM_ALLOWED_USERS - Comma-separated Telegram user IDs (empty = allow all)
 *   TELEGRAM_DEFAULT_USER  - Allerac user ID to map Telegram users to
 *   OLLAMA_BASE_URL        - Ollama API URL (default: http://ollama:11434)
 */

import { AlleracTelegramBot } from './app/services/telegram/telegram-bot.service';
import { UserSettingsService } from './app/services/user/user-settings.service';
import pool from './app/clients/db';

const TELEGRAM_ALLOWED_USERS = process.env.TELEGRAM_ALLOWED_USERS || '';
const TELEGRAM_DEFAULT_USER = process.env.TELEGRAM_DEFAULT_USER || '';
const TOKEN_POLL_INTERVAL = 10000; // 10 seconds

// Parse allowed users
const allowedUsers = TELEGRAM_ALLOWED_USERS
  ? TELEGRAM_ALLOWED_USERS.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
  : [];

// Wait for database to be ready
async function waitForDatabase(maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('[Telegram] Database connected.');
      return;
    } catch {
      console.log(`[Telegram] Waiting for database... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Database connection timeout');
}

// Try to find a bot token from the user_settings table
async function getTokenFromDB(): Promise<{ token: string; userId: string } | null> {
  try {
    const userSettings = new UserSettingsService();
    // Find any user that has a telegram_bot_token configured
    const result = await pool.query(
      'SELECT user_id FROM user_settings WHERE telegram_bot_token IS NOT NULL AND telegram_bot_token != \'\' LIMIT 1'
    );
    if (result.rows.length === 0) return null;

    const userId = result.rows[0].user_id;
    const settings = await userSettings.loadUserSettings(userId);
    if (!settings?.telegram_bot_token) return null;

    return { token: settings.telegram_bot_token, userId };
  } catch (error) {
    console.error('[Telegram] Error reading token from DB:', error);
    return null;
  }
}

// Find the default user ID (first user in the system)
async function findDefaultUserId(): Promise<string> {
  if (TELEGRAM_DEFAULT_USER && TELEGRAM_DEFAULT_USER !== '00000000-0000-0000-0000-000000000000') {
    return TELEGRAM_DEFAULT_USER;
  }
  try {
    const result = await pool.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
    if (result.rows.length > 0) {
      console.log(`[Telegram] Auto-detected user: ${result.rows[0].id}`);
      return result.rows[0].id;
    }
  } catch (error) {
    console.error('[Telegram] Error finding default user:', error);
  }
  return '00000000-0000-0000-0000-000000000000';
}

async function startBot(token: string, defaultUserId: string) {
  console.log('[Telegram] Starting Allerac One Telegram Bot...');
  console.log(`[Telegram] Allowed users: ${allowedUsers.length === 0 ? 'ALL (no restrictions)' : allowedUsers.join(', ')}`);
  console.log(`[Telegram] Default Allerac user: ${defaultUserId}`);

  const bot = new AlleracTelegramBot({
    token,
    allowedUsers,
    defaultUserId,
  });

  await bot.start();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Telegram] Shutting down...');
    await bot.stop();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  await waitForDatabase();

  const defaultUserId = await findDefaultUserId();

  // Priority 1: Env var token
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (envToken) {
    console.log('[Telegram] Using token from environment variable.');
    await startBot(envToken, defaultUserId);
    return;
  }

  // Priority 2: DB token (poll until available)
  console.log('[Telegram] No TELEGRAM_BOT_TOKEN env var. Checking database...');

  const dbResult = await getTokenFromDB();
  if (dbResult) {
    console.log('[Telegram] Using token from database (configured via web UI).');
    await startBot(dbResult.token, dbResult.userId || defaultUserId);
    return;
  }

  // No token found - poll DB until one appears
  console.log('[Telegram] No bot token configured yet.');
  console.log('[Telegram] Waiting for token... Configure it in Allerac Settings > API Keys > Telegram Bot Token');

  const pollForToken = async () => {
    while (true) {
      await new Promise(resolve => setTimeout(resolve, TOKEN_POLL_INTERVAL));
      const result = await getTokenFromDB();
      if (result) {
        console.log('[Telegram] Token detected in database! Starting bot...');
        await startBot(result.token, result.userId || defaultUserId);
        return;
      }
    }
  };

  await pollForToken();
}

main().catch(error => {
  console.error('[Telegram] Fatal error:', error);
  process.exit(1);
});
