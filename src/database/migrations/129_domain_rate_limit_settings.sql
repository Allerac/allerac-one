-- Per-domain overrides for the 'public-chat' operation limit (see
-- src/app/lib/operation-limiter.ts), plus optional Telegram alerting when a
-- domain's usage crosses a configured percentage of its daily cap.
--
-- Without a row here, a domain in PUBLIC_DOMAINS falls back to the global
-- RATE_LIMIT_PUBLIC_CHAT_REQUESTS / RATE_LIMIT_PUBLIC_CHAT_WINDOW_SECONDS env
-- vars (shared by every public domain, e.g. 'sales'). A row here overrides
-- just that one domain's limit without affecting the others.
--
-- telegram_bot_token is stored encrypted (services/crypto/encryption.service.ts),
-- same as other secrets in this codebase — never store it plain.

CREATE TABLE IF NOT EXISTS domain_rate_limit_settings (
  domain_slug TEXT PRIMARY KEY REFERENCES domains(slug) ON DELETE CASCADE,
  daily_requests INTEGER,
  daily_window_seconds INTEGER,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  alert_thresholds_percent INTEGER[] NOT NULL DEFAULT '{50,90}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
