'use server';

import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { PUBLIC_DOMAINS } from '@/app/services/chat/chat-tool-registry';
import {
  externalAgentMetricsService,
  type UsageGranularity,
} from '@/app/services/domains/external-agent-metrics.service';

export async function getPublicAgentDashboard() {
  await requireCurrentAdmin();
  return externalAgentMetricsService.getSummaries();
}

function assertPublicDomain(domainSlug: string): void {
  if (!PUBLIC_DOMAINS.includes(domainSlug)) {
    throw new Error(`"${domainSlug}" is not a public-facing domain`);
  }
}

export async function getPublicAgentRequestSeries(domainSlug: string, granularity: UsageGranularity) {
  await requireCurrentAdmin();
  assertPublicDomain(domainSlug);
  return externalAgentMetricsService.getRequestSeries(domainSlug, granularity);
}

export async function getPublicAgentTopModels(domainSlug: string) {
  await requireCurrentAdmin();
  assertPublicDomain(domainSlug);
  return externalAgentMetricsService.getTopModels(domainSlug, 3);
}
