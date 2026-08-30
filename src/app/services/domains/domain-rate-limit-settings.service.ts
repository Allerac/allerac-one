import pool from '@/app/clients/db';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import {
  peekOperationLimit,
  type OperationLimitOverride,
} from '@/app/lib/operation-limiter';
import { sendTelegramAlert } from '@/app/services/telegram/telegram-alert.service';

/** Internal shape — includes the decrypted bot token. Server-side use only (never send to the client). */
export interface DomainRateLimitSettings {
  domainSlug: string;
  dailyRequests: number | null;
  dailyWindowSeconds: number | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  alertThresholdsPercent: number[];
}

/** Client-safe view — same as above but the secret is reduced to a boolean, matching the
 * convention used for other tokens in this codebase (see actions/user.ts's `githubConfigured`). */
export interface DomainRateLimitSettingsView {
  domainSlug: string;
  dailyRequests: number | null;
  dailyWindowSeconds: number | null;
  telegramBotTokenConfigured: boolean;
  telegramChatId: string | null;
  alertThresholdsPercent: number[];
}

/** Input for saving from the UI: telegramBotToken is only sent when the user typed a new one —
 * omitted/undefined means "keep whatever is already stored". */
export interface SaveDomainRateLimitInput {
  domainSlug: string;
  dailyRequests: number | null;
  dailyWindowSeconds: number | null;
  telegramBotToken?: string;
  telegramChatId: string | null;
  alertThresholdsPercent: number[];
}

export interface DomainRateLimitUsage {
  used: number;
  limit: number;
  windowSeconds: number;
  resetSeconds: number;
  usedPercent: number;
}

const DEFAULT_THRESHOLDS = [50, 90];

// In-memory "already alerted this window" tracking, per domain. Threshold
// alerts are best-effort telemetry, not a compliance guarantee — same caveat
// as operation-limiter.ts itself: state resets on app restart, and this is
// fine (a missed or duplicate alert is a minor inconvenience, not a security
// issue). Keyed by domain slug; cleared whenever usage drops below the last
// alerted level, which is how a new day's window reset is detected.
const alertState = new Map<string, { lastUsed: number; alertedPercents: Set<number> }>();

export class DomainRateLimitSettingsService {
  /** Full settings including the decrypted token — server-side callers only (route handlers, this service). */
  async get(domainSlug: string): Promise<DomainRateLimitSettings> {
    const result = await pool.query(
      `SELECT daily_requests, daily_window_seconds, telegram_bot_token, telegram_chat_id, alert_thresholds_percent
       FROM domain_rate_limit_settings WHERE domain_slug = $1`,
      [domainSlug],
    );
    const row = result.rows[0];
    return {
      domainSlug,
      dailyRequests: row?.daily_requests ?? null,
      dailyWindowSeconds: row?.daily_window_seconds ?? null,
      telegramBotToken: row?.telegram_bot_token ? safeDecrypt(row.telegram_bot_token) : null,
      telegramChatId: row?.telegram_chat_id ?? null,
      alertThresholdsPercent: row?.alert_thresholds_percent ?? DEFAULT_THRESHOLDS,
    };
  }

  /** Client-safe read for the self-service panel — never exposes the raw token. */
  async getView(domainSlug: string): Promise<DomainRateLimitSettingsView> {
    const settings = await this.get(domainSlug);
    return {
      domainSlug: settings.domainSlug,
      dailyRequests: settings.dailyRequests,
      dailyWindowSeconds: settings.dailyWindowSeconds,
      telegramBotTokenConfigured: settings.telegramBotToken != null,
      telegramChatId: settings.telegramChatId,
      alertThresholdsPercent: settings.alertThresholdsPercent,
    };
  }

  async save(input: SaveDomainRateLimitInput): Promise<void> {
    if (input.dailyRequests != null && input.dailyRequests <= 0) {
      throw new Error('dailyRequests must be a positive number');
    }
    if (input.dailyWindowSeconds != null && input.dailyWindowSeconds <= 0) {
      throw new Error('dailyWindowSeconds must be a positive number');
    }
    const thresholds = input.alertThresholdsPercent
      .filter(value => Number.isInteger(value) && value > 0 && value <= 100)
      .sort((a, b) => a - b);

    // A blank token field means "leave the stored token untouched", not "clear it" —
    // use clearTelegramConfig() to actually remove it.
    let encryptedToken: string | null;
    if (input.telegramBotToken != null) {
      encryptedToken = encrypt(input.telegramBotToken);
    } else {
      const existing = await this.get(input.domainSlug);
      encryptedToken = existing.telegramBotToken ? encrypt(existing.telegramBotToken) : null;
    }

    await pool.query(
      `INSERT INTO domain_rate_limit_settings
         (domain_slug, daily_requests, daily_window_seconds, telegram_bot_token, telegram_chat_id, alert_thresholds_percent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (domain_slug) DO UPDATE SET
         daily_requests = EXCLUDED.daily_requests,
         daily_window_seconds = EXCLUDED.daily_window_seconds,
         telegram_bot_token = EXCLUDED.telegram_bot_token,
         telegram_chat_id = EXCLUDED.telegram_chat_id,
         alert_thresholds_percent = EXCLUDED.alert_thresholds_percent,
         updated_at = NOW()`,
      [
        input.domainSlug,
        input.dailyRequests,
        input.dailyWindowSeconds,
        encryptedToken,
        input.telegramChatId,
        thresholds.length > 0 ? thresholds : DEFAULT_THRESHOLDS,
      ],
    );
  }

  async clearTelegramConfig(domainSlug: string): Promise<void> {
    await pool.query(
      `UPDATE domain_rate_limit_settings
       SET telegram_bot_token = NULL, telegram_chat_id = NULL, updated_at = NOW()
       WHERE domain_slug = $1`,
      [domainSlug],
    );
  }

  /** The override to feed into acquireOperationLimit/peekOperationLimit for this domain's 'public-chat' bucket. */
  toOverride(settings: DomainRateLimitSettings): OperationLimitOverride {
    return {
      requests: settings.dailyRequests ?? undefined,
      windowMs: settings.dailyWindowSeconds != null ? settings.dailyWindowSeconds * 1_000 : undefined,
    };
  }

  /** Reads usage given already-loaded settings — use this when the caller has already fetched them (e.g. messages/route.ts). */
  usageFromSettings(settings: DomainRateLimitSettings, userId: string): DomainRateLimitUsage {
    const status = peekOperationLimit('public-chat', userId, this.toOverride(settings));
    return {
      ...status,
      usedPercent: status.limit > 0 ? Math.floor((status.used / status.limit) * 100) : 0,
    };
  }

  async getUsage(domainSlug: string, userId: string): Promise<DomainRateLimitUsage> {
    const settings = await this.get(domainSlug);
    return this.usageFromSettings(settings, userId);
  }

  /**
   * Fire-and-forget: checks whether current usage just crossed a configured
   * threshold and, if so, sends a Telegram alert. Never throws — a failed
   * alert should never break the chat request that triggered it.
   */
  async checkAndAlert(domainSlug: string, usage: DomainRateLimitUsage, settings: DomainRateLimitSettings): Promise<void> {
    if (!settings.telegramBotToken || !settings.telegramChatId) return;

    const state = alertState.get(domainSlug) ?? { lastUsed: 0, alertedPercents: new Set<number>() };
    if (usage.used < state.lastUsed) {
      // Usage dropped since last check — the window rolled over. Start fresh.
      state.alertedPercents.clear();
    }
    state.lastUsed = usage.used;

    const crossed = settings.alertThresholdsPercent
      .filter(threshold => usage.usedPercent >= threshold && !state.alertedPercents.has(threshold))
      .sort((a, b) => a - b);

    if (crossed.length === 0) {
      alertState.set(domainSlug, state);
      return;
    }

    const highest = crossed[crossed.length - 1];
    for (const threshold of crossed) state.alertedPercents.add(threshold);
    alertState.set(domainSlug, state);

    try {
      await sendTelegramAlert(
        settings.telegramBotToken,
        settings.telegramChatId,
        `⚠️ *${domainSlug}* atingiu *${highest}%* do limite diário de requisições ` +
        `(${usage.used}/${usage.limit}). Reseta em ~${Math.ceil(usage.resetSeconds / 3600)}h.`,
      );
    } catch (error) {
      console.error(`[domain-rate-limit] Failed to send Telegram alert for domain "${domainSlug}":`, error);
    }
  }
}

export const domainRateLimitSettingsService = new DomainRateLimitSettingsService();
