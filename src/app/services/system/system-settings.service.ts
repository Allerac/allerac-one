import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';

const KEYS = ['github_token', 'github_repo_token', 'tavily_api_key', 'anthropic_api_key', 'google_api_key', 'resend_api_key', 'resend_from_email'] as const;
const KEY_SET = new Set<string>(KEYS);
export type SystemSettingKey = typeof KEYS[number];

export interface SystemSettings {
  github_token: string | null;
  github_repo_token: string | null;
  tavily_api_key: string | null;
  anthropic_api_key: string | null;
  google_api_key: string | null;
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
      github_repo_token: map['github_repo_token'] ?? null,
      tavily_api_key: map['tavily_api_key'] ?? null,
      anthropic_api_key: map['anthropic_api_key'] ?? null,
      google_api_key: map['google_api_key'] ?? null,
      resend_api_key: map['resend_api_key'] ?? null,
      resend_from_email: map['resend_from_email'] ?? null,
    };
  }

  async get(key: SystemSettingKey): Promise<string | null> {
    const result = await pool.query(`SELECT value_encrypted FROM system_settings WHERE key = $1`, [key]);
    if (!result.rows[0]?.value_encrypted) return null;
    return safeDecrypt(result.rows[0].value_encrypted);
  }

  async set(key: SystemSettingKey, value: string, changedByUserId?: string): Promise<void> {
    if (!KEY_SET.has(key)) throw new Error('Invalid system setting key');
    if (typeof value !== 'string' || value.length > 10_000) {
      throw new Error('Invalid system setting value');
    }
    const encrypted = value.trim() ? encrypt(value.trim()) : '';
    await pool.query(
      `INSERT INTO system_settings (key, value_encrypted, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, updated_at = NOW()`,
      [key, encrypted]
    );
    if (changedByUserId) {
      const action = value.trim() ? 'set' : 'cleared';
      pool.query(
        `INSERT INTO api_key_audit_log (user_id, scope, key_name, action) VALUES ($1, 'system', $2, $3)`,
        [changedByUserId, key, action]
      ).catch(() => {});
    }
  }

  async saveAll(settings: Partial<SystemSettings>, changedByUserId?: string): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      if (KEY_SET.has(key) && value !== undefined) {
        await this.set(key as SystemSettingKey, value ?? '', changedByUserId);
      }
    }
  }
}
