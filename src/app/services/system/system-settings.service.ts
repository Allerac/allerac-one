import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';

const KEYS = [
  'github_token',
  'github_repo_token',
  'tavily_api_key',
  'anthropic_api_key',
  'google_api_key',
  'openai_api_key',
  'resend_api_key',
  'resend_from_email',
] as const;
const KEY_SET = new Set<string>(KEYS);
export type SystemSettingKey = typeof KEYS[number];

export interface SystemSettings {
  github_token: string | null;
  github_repo_token: string | null;
  tavily_api_key: string | null;
  anthropic_api_key: string | null;
  google_api_key: string | null;
  openai_api_key: string | null;
  resend_api_key: string | null;
  resend_from_email: string | null;
}

/** Keys whose values are credentials and must never be sent to a browser. */
export const SECRET_SYSTEM_SETTING_KEYS = [
  'github_token',
  'github_repo_token',
  'tavily_api_key',
  'anthropic_api_key',
  'google_api_key',
  'openai_api_key',
  'resend_api_key',
] as const satisfies readonly SystemSettingKey[];
export type SecretSystemSettingKey = typeof SECRET_SYSTEM_SETTING_KEYS[number];

export function isSystemSettingKey(key: string): key is SystemSettingKey {
  return KEY_SET.has(key);
}

export interface SecretSettingStatus {
  configured: boolean;
  /** Masked trailing characters, only for values long enough to keep the rest hidden. */
  hint: string | null;
}

/** Client-safe view of the system settings: secrets are reduced to a status. */
export type PublicSystemSettings = Record<SecretSystemSettingKey, SecretSettingStatus> & {
  resend_from_email: string | null;
};

const HINT_MIN_LENGTH = 20;
const HINT_SUFFIX_LENGTH = 4;

export function secretSettingStatus(value: string | null | undefined): SecretSettingStatus {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return { configured: false, hint: null };
  return {
    configured: true,
    hint: trimmed.length >= HINT_MIN_LENGTH ? `••••${trimmed.slice(-HINT_SUFFIX_LENGTH)}` : null,
  };
}

export function toPublicSystemSettings(settings: SystemSettings): PublicSystemSettings {
  const result = { resend_from_email: settings.resend_from_email ?? null } as PublicSystemSettings;
  for (const key of SECRET_SYSTEM_SETTING_KEYS) {
    result[key] = secretSettingStatus(settings[key]);
  }
  return result;
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
      openai_api_key: map['openai_api_key'] ?? null,
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
