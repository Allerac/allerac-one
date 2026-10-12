import pool from '@/app/clients/db';
import { PUBLIC_DOMAINS } from '@/app/services/chat/chat-tool-registry';
import { domainService } from '@/app/services/domains/domain.service';
import { domainModelSettingsService } from '@/app/services/domains/domain-model-settings.service';
import { domainRateLimitSettingsService } from '@/app/services/domains/domain-rate-limit-settings.service';

export interface PublicAgentCostStats {
  requests: number;
  tokens: number;
  costUsd: number;
}

export interface PublicAgentSummary {
  domainSlug: string;
  displayName: string;
  ownerEmail: string | null;
  modelId: string | null;
  provider: string | null;
  usage: {
    used: number;
    limit: number;
    usedPercent: number;
    resetSeconds: number;
  } | null;
  alertsConfigured: boolean;
  alertThresholdsPercent: number[];
  today: PublicAgentCostStats;
  month: PublicAgentCostStats;
}

async function getCostStats(domainSlug: string, timeFilter: string): Promise<PublicAgentCostStats> {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS requests,
       COALESCE(SUM(tu.total_tokens), 0) AS tokens,
       COALESCE(SUM(tu.estimated_cost_usd), 0) AS cost_usd
     FROM tokens_usage tu
     JOIN chat_conversations cc ON cc.id = tu.conversation_id
     WHERE cc.domain_slug = $1 AND tu.${timeFilter}`,
    [domainSlug],
  );
  const row = result.rows[0];
  return {
    requests: Number.parseInt(row.requests, 10),
    tokens: Number.parseInt(row.tokens, 10),
    costUsd: Number.parseFloat(row.cost_usd),
  };
}

export type UsageGranularity = 'day' | 'week' | 'month';

export interface UsageBucket {
  /** ISO date string for the bucket start (day/week/month, per granularity). */
  bucket: string;
  requests: number;
}

export interface ModelUsageShare {
  /** null represents the "Other" bucket (everything past the top N models). */
  model: string | null;
  requests: number;
}

const GRANULARITY_WINDOW: Record<UsageGranularity, string> = {
  day: '14 days',
  week: '8 weeks',
  month: '6 months',
};

export class ExternalAgentMetricsService {
  /** Request counts bucketed by day/week/month, oldest first — for the usage chart. */
  async getRequestSeries(domainSlug: string, granularity: UsageGranularity): Promise<UsageBucket[]> {
    const window = GRANULARITY_WINDOW[granularity];
    const result = await pool.query(
      `SELECT date_trunc($2, tu.timestamp) AS bucket, COUNT(*) AS requests
       FROM tokens_usage tu
       JOIN chat_conversations cc ON cc.id = tu.conversation_id
       WHERE cc.domain_slug = $1 AND tu.timestamp >= NOW() - $3::interval
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [domainSlug, granularity, window],
    );
    return result.rows.map(row => ({
      bucket: new Date(row.bucket).toISOString(),
      requests: Number.parseInt(row.requests, 10),
    }));
  }

  /** Top N models by request count this month, plus an "Other" bucket for the rest. */
  async getTopModels(domainSlug: string, limit = 3): Promise<ModelUsageShare[]> {
    const result = await pool.query(
      `SELECT tu.model, COUNT(*) AS requests
       FROM tokens_usage tu
       JOIN chat_conversations cc ON cc.id = tu.conversation_id
       WHERE cc.domain_slug = $1 AND tu.timestamp >= date_trunc('month', NOW())
       GROUP BY tu.model
       ORDER BY requests DESC`,
      [domainSlug],
    );
    const rows = result.rows.map(row => ({ model: row.model as string, requests: Number.parseInt(row.requests, 10) }));
    const top = rows.slice(0, limit);
    const rest = rows.slice(limit);
    const otherRequests = rest.reduce((sum, row) => sum + row.requests, 0);
    return otherRequests > 0 ? [...top, { model: null, requests: otherRequests }] : top;
  }


  /** One summary per domain in PUBLIC_DOMAINS — the admin dashboard for public-facing bots. */
  async getSummaries(): Promise<PublicAgentSummary[]> {
    return Promise.all(PUBLIC_DOMAINS.map(domainSlug => this.getSummary(domainSlug)));
  }

  private async getSummary(domainSlug: string): Promise<PublicAgentSummary> {
    const domainRow = await pool.query('SELECT display_name FROM domains WHERE slug = $1', [domainSlug]);
    const displayName = domainRow.rows[0]?.display_name ?? domainSlug;

    const owner = await domainService.findDomainOwner(domainSlug);
    const rateLimitSettings = await domainRateLimitSettingsService.get(domainSlug);

    let modelId: string | null = null;
    let provider: string | null = null;
    let usage: PublicAgentSummary['usage'] = null;

    if (owner) {
      const modelSettings = await domainModelSettingsService.get(owner.id, domainSlug);
      modelId = modelSettings.modelId;
      // domain-model-settings.service.ts's `get()` only returns modelId, not provider —
      // resolveDomainDefault cross-checks it against the known MODELS list and derives it.
      const resolved = await domainModelSettingsService.resolveDomainDefault(owner.id, domainSlug);
      provider = resolved?.provider ?? null;

      const usageStats = domainRateLimitSettingsService.usageFromSettings(rateLimitSettings, owner.id);
      usage = {
        used: usageStats.used,
        limit: usageStats.limit,
        usedPercent: usageStats.usedPercent,
        resetSeconds: usageStats.resetSeconds,
      };
    }

    const [today, month] = await Promise.all([
      getCostStats(domainSlug, `timestamp >= CURRENT_DATE`),
      getCostStats(domainSlug, `timestamp >= date_trunc('month', NOW())`),
    ]);

    return {
      domainSlug,
      displayName,
      ownerEmail: owner?.email ?? null,
      modelId,
      provider,
      usage,
      alertsConfigured: Boolean(rateLimitSettings.telegramBotToken && rateLimitSettings.telegramChatId),
      alertThresholdsPercent: rateLimitSettings.alertThresholdsPercent,
      today,
      month,
    };
  }
}

export const externalAgentMetricsService = new ExternalAgentMetricsService();
