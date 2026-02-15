/**
 * Telegram Bot Config Service
 * Manages self-service bot configurations stored in the database
 */

import { pool } from '@/app/clients/db';
import crypto from 'crypto';

// Encryption key from environment (should be 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production!!';
const ALGORITHM = 'aes-256-cbc';

export interface TelegramBotConfig {
  id: string;
  userId: string;
  botName: string;
  botToken: string; // Decrypted
  botUsername?: string;
  allowedTelegramIds: number[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface DbBotConfig {
  id: string;
  user_id: string;
  bot_name: string;
  bot_token: string; // Encrypted
  bot_username?: string;
  allowed_telegram_ids: string[];
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Encrypt a bot token for storage
 */
function encryptToken(token: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV + encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a bot token from storage
 */
function decryptToken(encryptedToken: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Convert DB row to TelegramBotConfig
 */
function dbToConfig(row: DbBotConfig): TelegramBotConfig {
  return {
    id: row.id,
    userId: row.user_id,
    botName: row.bot_name,
    botToken: decryptToken(row.bot_token),
    botUsername: row.bot_username,
    allowedTelegramIds: row.allowed_telegram_ids.map(id => parseInt(id)),
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TelegramBotConfigService {
  /**
   * Create a new bot configuration
   */
  static async createBotConfig(
    userId: string,
    botName: string,
    botToken: string,
    allowedTelegramIds: number[],
    botUsername?: string
  ): Promise<TelegramBotConfig> {
    const encryptedToken = encryptToken(botToken);
    
    const result = await pool.query<DbBotConfig>(
      `INSERT INTO telegram_bot_configs 
        (user_id, bot_name, bot_token, bot_username, allowed_telegram_ids, enabled)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [userId, botName, encryptedToken, botUsername || null, allowedTelegramIds]
    );
    
    return dbToConfig(result.rows[0]);
  }

  /**
   * Get all bot configs for a user
   */
  static async getUserBotConfigs(userId: string): Promise<TelegramBotConfig[]> {
    const result = await pool.query<DbBotConfig>(
      `SELECT * FROM telegram_bot_configs 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    
    return result.rows.map(dbToConfig);
  }

  /**
   * Get a specific bot config
   */
  static async getBotConfig(id: string, userId: string): Promise<TelegramBotConfig | null> {
    const result = await pool.query<DbBotConfig>(
      `SELECT * FROM telegram_bot_configs 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (result.rows.length === 0) return null;
    return dbToConfig(result.rows[0]);
  }

  /**
   * Get all enabled bot configs (for multi-bot startup)
   */
  static async getAllEnabledBotConfigs(): Promise<TelegramBotConfig[]> {
    const result = await pool.query<DbBotConfig>(
      `SELECT * FROM telegram_bot_configs 
       WHERE enabled = true 
       ORDER BY created_at`
    );
    
    return result.rows.map(dbToConfig);
  }

  /**
   * Update bot configuration
   */
  static async updateBotConfig(
    id: string,
    userId: string,
    updates: {
      botName?: string;
      botToken?: string;
      botUsername?: string;
      allowedTelegramIds?: number[];
      enabled?: boolean;
    }
  ): Promise<TelegramBotConfig | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.botName !== undefined) {
      fields.push(`bot_name = $${paramIndex++}`);
      values.push(updates.botName);
    }
    if (updates.botToken !== undefined) {
      fields.push(`bot_token = $${paramIndex++}`);
      values.push(encryptToken(updates.botToken));
    }
    if (updates.botUsername !== undefined) {
      fields.push(`bot_username = $${paramIndex++}`);
      values.push(updates.botUsername);
    }
    if (updates.allowedTelegramIds !== undefined) {
      fields.push(`allowed_telegram_ids = $${paramIndex++}`);
      values.push(updates.allowedTelegramIds);
    }
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (fields.length === 0) {
      return this.getBotConfig(id, userId);
    }

    values.push(id, userId);
    
    const result = await pool.query<DbBotConfig>(
      `UPDATE telegram_bot_configs 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) return null;
    return dbToConfig(result.rows[0]);
  }

  /**
   * Toggle bot enabled status
   */
  static async toggleBotEnabled(id: string, userId: string): Promise<TelegramBotConfig | null> {
    const result = await pool.query<DbBotConfig>(
      `UPDATE telegram_bot_configs 
       SET enabled = NOT enabled
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    
    if (result.rows.length === 0) return null;
    return dbToConfig(result.rows[0]);
  }

  /**
   * Delete a bot configuration
   */
  static async deleteBotConfig(id: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM telegram_bot_configs 
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Get timestamp of last configuration change (for hot reload detection)
   */
  static async getLastUpdateTimestamp(): Promise<Date | null> {
    const result = await pool.query<{ updated_at: Date }>(
      `SELECT MAX(updated_at) as updated_at 
       FROM telegram_bot_configs`
    );
    
    return result.rows[0]?.updated_at || null;
  }
}
