import pool from '@/app/clients/db';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

export interface CapabilityStatus {
  configured: boolean;
  available: boolean;
  connected?: boolean;
}

export interface CapabilityMap {
  llm: {
    github: CapabilityStatus;
    gemini: CapabilityStatus;
    anthropic: CapabilityStatus;
    ollama: CapabilityStatus;
  };
  search: {
    tavily: CapabilityStatus;
  };
  notifications: {
    telegram: CapabilityStatus;
    resend: CapabilityStatus;
  };
  storage: {
    azureBlob: CapabilityStatus;
  };
  social: {
    instagram: CapabilityStatus;
    tiktok: CapabilityStatus;
  };
  email: {
    imap: CapabilityStatus;
    smtp: CapabilityStatus;
  };
  health: {
    garmin: CapabilityStatus;
  };
}

export interface CapabilitiesResponse {
  capabilities: CapabilityMap;
  defaults: {
    chatModel: string | null;
  };
}

const configured = (value: unknown): boolean => Boolean(typeof value === 'string' ? value.trim() : value);
const status = (isConfigured: boolean, connected?: boolean): CapabilityStatus => ({
  configured: isConfigured,
  ...(connected !== undefined ? { connected } : {}),
  available: connected === undefined ? isConfigured : isConfigured && connected,
});

async function checkOllamaConnected(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      method: 'GET',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function countRows(query: string, params: unknown[]): Promise<number> {
  const result = await pool.query(query, params);
  return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export class CapabilitiesService {
  private userSettingsService = new UserSettingsService();
  private systemSettingsService = new SystemSettingsService();

  async loadForUser(userId: string): Promise<CapabilitiesResponse> {
    const [userSettings, systemSettings, ollamaConnected, emailAccounts, telegramBots, garminStatus, instagramStatus, tiktokStatus] = await Promise.all([
      this.userSettingsService.loadUserSettings(userId),
      this.systemSettingsService.loadAll(),
      checkOllamaConnected(),
      countRows('SELECT COUNT(*) FROM user_email_accounts WHERE user_id = $1', [userId]),
      countRows('SELECT COUNT(*) FROM telegram_bot_configs WHERE user_id = $1 AND enabled = true', [userId]),
      pool.query(
        `SELECT is_connected, sync_enabled
         FROM garmin_credentials
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT is_connected
         FROM instagram_credentials
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT is_connected
         FROM tiktok_credentials
         WHERE user_id = $1
         LIMIT 1`,
        [userId],
      ).catch(() => ({ rows: [] })),
    ]);

    const garminRow = garminStatus.rows[0];
    const garminConfigured = Boolean(garminRow);
    const garminConnected = Boolean(garminRow?.is_connected && garminRow?.sync_enabled);
    const instagramRow = instagramStatus.rows[0];
    const tiktokRow = tiktokStatus.rows[0];

    const githubConfigured = configured(userSettings?.github_token)
      || configured(systemSettings.github_token)
      || configured(process.env.GITHUB_TOKEN);
    const geminiConfigured = configured(userSettings?.google_api_key)
      || configured(systemSettings.google_api_key);
    const anthropicConfigured = configured(userSettings?.anthropic_api_key)
      || configured(systemSettings.anthropic_api_key);
    const tavilyConfigured = configured(userSettings?.tavily_api_key)
      || configured(systemSettings.tavily_api_key)
      || configured(process.env.TAVILY_API_KEY);
    const telegramConfigured = configured(userSettings?.telegram_bot_token) || telegramBots > 0;
    const resendConfigured = (configured(systemSettings.resend_api_key) && configured(systemSettings.resend_from_email))
      || (configured(process.env.RESEND_API_KEY) && configured(process.env.RESEND_FROM_EMAIL));
    const azureBlobConfigured = configured(process.env.AZURE_STORAGE_ACCOUNT_NAME)
      && configured(process.env.AZURE_STORAGE_CONTAINER_NAME)
      && configured(process.env.AZURE_STORAGE_ACCOUNT_KEY);
    const instagramAppConfigured = configured(process.env.INSTAGRAM_APP_ID)
      && configured(process.env.INSTAGRAM_APP_SECRET)
      && configured(process.env.INSTAGRAM_REDIRECT_URI);
    const tiktokAppConfigured = configured(process.env.TIKTOK_CLIENT_KEY)
      && configured(process.env.TIKTOK_CLIENT_SECRET)
      && configured(process.env.TIKTOK_REDIRECT_URI);
    const emailConfigured = emailAccounts > 0;

    return {
      capabilities: {
        llm: {
          github: status(githubConfigured),
          gemini: status(geminiConfigured),
          anthropic: status(anthropicConfigured),
          ollama: status(true, ollamaConnected),
        },
        search: {
          tavily: status(tavilyConfigured),
        },
        notifications: {
          telegram: status(telegramConfigured),
          resend: status(resendConfigured),
        },
        storage: {
          azureBlob: status(azureBlobConfigured),
        },
        social: {
          instagram: status(instagramAppConfigured || Boolean(instagramRow), Boolean(instagramRow?.is_connected)),
          tiktok: status(tiktokAppConfigured || Boolean(tiktokRow), Boolean(tiktokRow?.is_connected)),
        },
        email: {
          imap: status(emailConfigured),
          smtp: status(emailConfigured),
        },
        health: {
          garmin: status(garminConfigured, garminConnected),
        },
      },
      defaults: {
        chatModel: userSettings?.selected_model ?? 'gemini-2.5-flash',
      },
    };
  }
}
