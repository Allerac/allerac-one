import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';

async function writeAuditLog(userId: string, keyName: string, value: string | undefined) {
  if (value === undefined) return;
  const action = value ? 'set' : 'cleared';
  pool.query(
    `INSERT INTO api_key_audit_log (user_id, scope, key_name, action) VALUES ($1, 'user', $2, $3)`,
    [userId, keyName, action]
  ).catch(() => {});
}

export class UserSettingsService {

  async loadUserSettings(userId: string) {
    try {
      const res = await pool.query(
        'SELECT github_token, tavily_api_key, telegram_bot_token, system_message, google_api_key, google_key_preference, anthropic_api_key, location, timezone, onboarding_completed, selected_model, language FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (res.rows.length === 0) return null;

      const row = res.rows[0];
      return {
        github_token: row.github_token ? safeDecrypt(row.github_token) : null,
        tavily_api_key: row.tavily_api_key ? safeDecrypt(row.tavily_api_key) : null,
        telegram_bot_token: row.telegram_bot_token ? safeDecrypt(row.telegram_bot_token) : null,
        system_message: row.system_message || null,
        google_api_key: row.google_api_key ? safeDecrypt(row.google_api_key) : null,
        google_key_preference: row.google_key_preference || 'personal',
        anthropic_api_key: row.anthropic_api_key ? safeDecrypt(row.anthropic_api_key) : null,
        location: row.location || null,
        timezone: row.timezone || null,
        onboarding_completed: row.onboarding_completed ?? false,
        selected_model: row.selected_model || null,
        language: row.language || 'en',
      };
    } catch (error) {
      console.error('Error loading user settings:', error);
      return null;
    }
  }

  async setGoogleKeyPreference(userId: string, preference: 'personal' | 'allerac') {
    await pool.query(
      `INSERT INTO user_settings (user_id, google_key_preference)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET google_key_preference = $2`,
      [userId, preference],
    );
    return { success: true };
  }

  async clearGoogleApiKey(userId: string) {
    await pool.query(
      `INSERT INTO user_settings (user_id, google_api_key, google_key_preference)
       VALUES ($1, NULL, 'allerac')
       ON CONFLICT (user_id) DO UPDATE
       SET google_api_key = NULL, google_key_preference = 'allerac'`,
      [userId],
    );
    await writeAuditLog(userId, 'google_api_key', '');
    return { success: true };
  }

  async saveUserSettings(userId: string, githubToken?: string, tavilyApiKey?: string, telegramBotToken?: string, googleApiKey?: string, anthropicApiKey?: string, location?: string, timezone?: string) {
    try {
      const encryptedGithubToken = githubToken ? encrypt(githubToken) : undefined;
      const encryptedTavilyKey = tavilyApiKey ? encrypt(tavilyApiKey) : undefined;
      const encryptedTelegramToken = telegramBotToken ? encrypt(telegramBotToken) : undefined;
      const encryptedGoogleKey = googleApiKey ? encrypt(googleApiKey) : undefined;
      const encryptedAnthropicKey = anthropicApiKey ? encrypt(anthropicApiKey) : undefined;

      const existingCheck = await pool.query(
        'SELECT 1 FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (existingCheck.rows.length > 0) {
        const updateFields: string[] = [];
        const values: unknown[] = [];
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
        if (encryptedGoogleKey !== undefined) {
          updateFields.push(`google_api_key = $${paramCount++}`);
          values.push(encryptedGoogleKey);
          updateFields.push(`google_key_preference = $${paramCount++}`);
          values.push('personal');
        }
        if (encryptedAnthropicKey !== undefined) {
          updateFields.push(`anthropic_api_key = $${paramCount++}`);
          values.push(encryptedAnthropicKey);
        }
        if (location !== undefined) {
          updateFields.push(`location = $${paramCount++}`);
          values.push(location || null);
        }
        if (timezone !== undefined) {
          updateFields.push(`timezone = $${paramCount++}`);
          values.push(timezone || null);
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
          `INSERT INTO user_settings (
             user_id, github_token, tavily_api_key, telegram_bot_token,
             google_api_key, google_key_preference, anthropic_api_key
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            encryptedGithubToken || '',
            encryptedTavilyKey || '',
            encryptedTelegramToken || '',
            encryptedGoogleKey || '',
            encryptedGoogleKey ? 'personal' : 'allerac',
            encryptedAnthropicKey || '',
          ]
        );
      }

      // Fire-and-forget audit log for API key fields only
      writeAuditLog(userId, 'github_token', githubToken);
      writeAuditLog(userId, 'tavily_api_key', tavilyApiKey);
      writeAuditLog(userId, 'telegram_bot_token', telegramBotToken);
      writeAuditLog(userId, 'google_api_key', googleApiKey);
      writeAuditLog(userId, 'anthropic_api_key', anthropicApiKey);

      return { success: true };
    } catch (error) {
      console.error('Error saving user settings:', error);
      return { success: false, error };
    }
  }

  async saveSelectedModel(userId: string, modelId: string) {
    try {
      await pool.query(
        `INSERT INTO user_settings (user_id, selected_model)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET selected_model = $2`,
        [userId, modelId]
      );
      return { success: true };
    } catch (error) {
      console.error('Error saving selected model:', error);
      return { success: false, error };
    }
  }

  async completeOnboarding(userId: string) {
    try {
      await pool.query(
        `INSERT INTO user_settings (user_id, onboarding_completed)
         VALUES ($1, TRUE)
         ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = TRUE`,
        [userId]
      );
      return { success: true };
    } catch (error) {
      console.error('Error completing onboarding:', error);
      return { success: false, error };
    }
  }

  async completeHubTour(userId: string) {
    try {
      await pool.query(
        `UPDATE users SET completed_onboarding_tour = TRUE WHERE id = $1`,
        [userId]
      );
      return { success: true };
    } catch (error) {
      console.error('Error completing hub tour:', error);
      return { success: false, error };
    }
  }
}
