// User settings service for managing API keys

import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';

export class UserSettingsService {

  /**
   * Load user settings (API keys) from database
   * Decrypts sensitive fields before returning
   */
  async loadUserSettings(userId: string) {
    try {
      const res = await pool.query(
        'SELECT github_token, tavily_api_key, telegram_bot_token, system_message FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (res.rows.length === 0) {
        return null;
      }

      const row = res.rows[0];

      // Decrypt tokens before returning
      return {
        github_token: row.github_token ? safeDecrypt(row.github_token) : null,
        tavily_api_key: row.tavily_api_key ? safeDecrypt(row.tavily_api_key) : null,
        telegram_bot_token: row.telegram_bot_token ? safeDecrypt(row.telegram_bot_token) : null,
        system_message: row.system_message || null,
      };
    } catch (error) {
      console.error('Error loading user settings:', error);
      return null;
    }
  }

  /**
   * Save or update user API keys
   * Encrypts sensitive fields before storing
   */
  async saveUserSettings(userId: string, githubToken?: string, tavilyApiKey?: string, telegramBotToken?: string) {
    try {
      // Encrypt tokens before storing
      const encryptedGithubToken = githubToken ? encrypt(githubToken) : undefined;
      const encryptedTavilyKey = tavilyApiKey ? encrypt(tavilyApiKey) : undefined;
      const encryptedTelegramToken = telegramBotToken ? encrypt(telegramBotToken) : undefined;

      // Check if settings already exist (query directly to avoid decrypt overhead)
      const existingCheck = await pool.query(
        'SELECT 1 FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (existingCheck.rows.length > 0) {
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (encryptedGithubToken !== undefined) {
          updateFields.push(`github_token = $${paramCount++}`);
          values.push(encryptedGithubToken);
        }
        if (encryptedTavilyKey !== undefined) {
          updateFields.push(`tavily_api_key = $${paramCount++}`);
          values.push(encryptedTavilyKey);
        }
        if (encryptedTelegramToken !== undefined) {
          updateFields.push(`telegram_bot_token = $${paramCount++}`);
          values.push(encryptedTelegramToken);
        }

        if (updateFields.length > 0) {
          values.push(userId);
          await pool.query(
            `UPDATE user_settings SET ${updateFields.join(', ')} WHERE user_id = $${paramCount}`,
            values
          );
        }
      } else {
        await pool.query(
          `INSERT INTO user_settings (user_id, github_token, tavily_api_key, telegram_bot_token)
           VALUES ($1, $2, $3, $4)`,
          [userId, encryptedGithubToken || '', encryptedTavilyKey || '', encryptedTelegramToken || '']
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error saving user settings:', error);
      return { success: false, error };
    }
  }
}
