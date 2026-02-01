// User settings service for managing API keys

import pool from '@/app/clients/db';

export class UserSettingsService {

  /**
   * Load user settings (API keys) from database
   */
  async loadUserSettings(userId: string) {
    try {
      const res = await pool.query(
        'SELECT github_token, tavily_api_key FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (res.rows.length === 0) {
        return null;
      }

      return res.rows[0];
    } catch (error) {
      console.error('Error loading user settings:', error);
      return null;
    }
  }

  /**
   * Save or update user API keys
   */
  async saveUserSettings(userId: string, githubToken?: string, tavilyApiKey?: string) {
    try {
      // Upsert settings
      // We need to construct the update query dynamically or just use simple logic if we always want to set provided values.
      // But ON CONFLICT UPDATE is easiest if we are setting all or nothing.
      // However, parameters are optional.
      // A better approach for optional updates in SQL is:
      // INSERT ... ON CONFLICT (user_id) DO UPDATE SET github_token = COALESCE(EXCLUDED.github_token, user_settings.github_token) ... 
      // But passing undefined means we shouldn't change it.

      // Let's check existence first, similar to original logic, or use clever SQL.

      const existing = await this.loadUserSettings(userId);

      if (existing) {
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (githubToken !== undefined) {
          updateFields.push(`github_token = $${paramCount++}`);
          values.push(githubToken);
        }
        if (tavilyApiKey !== undefined) {
          updateFields.push(`tavily_api_key = $${paramCount++}`);
          values.push(tavilyApiKey);
        }

        // Always update updated_at? (Trigger handles it)

        if (updateFields.length > 0) {
          values.push(userId);
          await pool.query(
            `UPDATE user_settings SET ${updateFields.join(', ')} WHERE user_id = $${paramCount}`,
            values
          );
        }
      } else {
        await pool.query(
          `INSERT INTO user_settings (user_id, github_token, tavily_api_key)
           VALUES ($1, $2, $3)`,
          [userId, githubToken || '', tavilyApiKey || '']
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error saving user settings:', error);
      return { success: false, error };
    }
  }
}
