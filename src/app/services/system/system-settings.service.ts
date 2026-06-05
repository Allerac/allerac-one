import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';

const KEYS = ['github_token', 'tavily_api_key', 'anthropic_api_key', 'google_api_key', 'fal_ai_api_key', 'resend_api_key', 'resend_from_email'] as const;
export type SystemSettingKey = typeof KEYS[number];

export interface SystemSettings {
  github_token: string | null;
  tavily_api_key: string | null;
  anthropic_api_key: string | null;
  google_api_key: string | null;
  fal_ai_api_key: string | null;
  resend_api_key: string | null;
  resend_from_email: string | null;
}

export class SystemSettingsService {
  async loadAll(): Promise<SystemSettings> {
    const result = await pool.query(`SELECT key, value_encrypted FROM system_settings WHERE key = ANY($1)`, [KEYS]);
    const map: Record<string, string | null> = {};
    for (const row of result.rows) {
      map[row.key] = row.value_encrypted ? safeDecrypt(row.value_encrypted) : null;
    }
    return {
      github_token: map['github_token'] ?? null,
      tavily_api_key: map['tavily_api_key'] ?? null,
      anthropic_api_key: map['anthropic_api_key'] ?? null,
      google_api_key: map['google_api_key'] ?? null,
      fal_ai_api_key: map['fal_ai_api_key'] ?? null,
      resend_api_key: map['resend_api_key'] ?? null,
      resend_from_email: map['resend_from_email'] ?? null,
    };
  }

  async get(key: SystemSettingKey): Promise<string | null> {
    const result = await pool.query(`SELECT value_encrypted FROM system_settings WHERE key = $1`, [key]);
    if (!result.rows[0]?.value_encrypted) return null;
    return safeDecrypt(result.rows[0].value_encrypted);
  }

  async set(key: SystemSettingKey, value: string): Promise<void> {
    const encrypted = value.trim() ? encrypt(value.trim()) : '';
    await pool.query(
      `INSERT INTO system_settings (key, value_encrypted, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, updated_at = NOW()`,
      [key, encrypted]
    );
  }

  async saveAll(settings: Partial<SystemSettings>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await this.set(key as SystemSettingKey, value ?? '');
      }
    }
  }
}
