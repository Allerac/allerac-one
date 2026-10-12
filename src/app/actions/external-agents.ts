'use server';

import { assertDomainAccess, requireCurrentAdmin, requireCurrentUser } from '@/app/lib/auth-session';
import { PUBLIC_DOMAINS } from '@/app/services/chat/chat-tool-registry';
import {
  externalAgentMetricsService,
  type UsageGranularity,
} from '@/app/services/domains/external-agent-metrics.service';
import { sendDomainTestMessage } from '@/app/services/domains/domain-test-chat.service';

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

export async function sendPublicAgentTestMessage(input: {
  domainSlug: string;
  message: string;
  conversationId?: string | null;
  modelId?: string | null;
}) {
  // Unlike the BOTS dashboard actions above (admin-only, viewed from /logs), this is
  // invoked from the domain's own self-service screen (/openworld, /sales) — reachable
  // by that domain's non-admin bot account, not just an admin. Same check as the
  // model/rate-limit settings actions on that same screen.
  const user = await requireCurrentUser();
  await assertDomainAccess(user, input.domainSlug);
  assertPublicDomain(input.domainSlug);
  return sendDomainTestMessage(input);
}
