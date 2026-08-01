-- Outbound webhook delivery target for scheduled jobs (e.g. an n8n Webhook Trigger).
-- 'webhook' becomes a valid entry in scheduled_jobs.channels alongside 'telegram';
-- webhook_url holds the single target URL used when that channel is enabled.
-- See docs/roadmap/n8n-workflow-integration.md.

ALTER TABLE scheduled_jobs
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;
