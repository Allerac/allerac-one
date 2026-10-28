/**
 * Inbound federation agents (roadmap P3): what a paired Unit may list and ask.
 *
 * A federated agent is a domain this Unit explicitly exposes
 * (ALLERAC_FEDERATION_AGENTS), answered as the peer's acting user with the
 * restricted 'federated' tool policy. Public domains are never exposed.
 */
import { PUBLIC_DOMAINS } from '@/app/services/chat/public-domains';
import type { OperationLimitResult } from '@/app/lib/operation-limiter';
import type { User } from '@/app/services/auth/auth.service';
import { isDomainEnabled } from '@/modules/registry';
import type { FederationAuditSink } from './audit.repository';
import { exposedAgentSlugs, type Env } from './env';
import { FederationError, federationErrors } from './errors';
import type { PeerAgent } from './federation-client';
import type { PeerRecord, PeerStore } from './peer.types';
import { toPeerProfile, type PeerUnitProfile, type UnitProfile } from './unit-profile';

export const MAX_QUESTION_CHARS = 4_000;
export const MAX_ANSWER_CHARS = 8_000;
export const ASK_SERVER_TIMEOUT_MS = 55_000;

export interface AgentsRuntime {
  loadUser(userId: string): Promise<User | null>;
  listActiveDomains(slugs: string[]): Promise<Array<{ slug: string; displayName: string }>>;
  canAccessDomain(user: User, slug: string): Promise<boolean>;
  findOrCreateConversation(userId: string, slug: string, title: string): Promise<string>;
  resolveModel(userId: string, slug: string): Promise<{ modelId: string; provider: string } | null>;
  runChat(input: {
    user: User;
    conversationId: string;
    domain: string;
    message: string;
    modelId: string;
    provider: string;
    locale: string;
  }): Promise<{ content: string }>;
}

type Acquire = (operation: 'federation-ask' | 'chat', subject: string) => OperationLimitResult;

export interface AgentsServiceDeps {
  runtime: AgentsRuntime;
  store: PeerStore;
  audit: FederationAuditSink;
  acquire: Acquire;
  /** Unit identity & role (P3.5). Optional so older wiring keeps working. */
  loadProfile?: () => Promise<UnitProfile>;
  env?: Env;
  now?: () => number;
}

export class FederationRateLimitedError extends FederationError {
  constructor(public readonly retryAfterSeconds: number, public readonly headers: Record<string, string>) {
    super('rate_limited', 'Too many federated requests', 429);
  }
}

export class AgentsService {
  private readonly env: Env;
  private readonly now: () => number;

  constructor(private readonly deps: AgentsServiceDeps) {
    this.env = deps.env ?? process.env;
    this.now = deps.now ?? Date.now;
  }

  private async resolveCaller(principalId: string, actingUserId: string): Promise<{ peer: PeerRecord; user: User }> {
    const peer = await this.deps.store.findActiveByPrincipal(principalId);
    if (!peer) throw federationErrors.notPaired();
    const user = await this.deps.runtime.loadUser(actingUserId);
    if (!user) throw federationErrors.notPaired();
    return { peer, user };
  }

  private async exposedAgents(user: User): Promise<PeerAgent[]> {
    const slugs = exposedAgentSlugs(this.env)
      .filter(slug => !PUBLIC_DOMAINS.includes(slug) && isDomainEnabled(slug, this.env));
    if (slugs.length === 0) return [];
    const domains = await this.deps.runtime.listActiveDomains(slugs);
    const descriptions = (await this.loadProfile())?.agentDescriptions ?? {};
    const agents: PeerAgent[] = [];
    for (const domain of domains) {
      if (await this.deps.runtime.canAccessDomain(user, domain.slug)) {
        agents.push({ id: domain.slug, name: domain.displayName, description: descriptions[domain.slug]?.slice(0, 500) || null });
      }
    }
    return agents;
  }

  private async loadProfile(): Promise<UnitProfile | null> {
    if (!this.deps.loadProfile) return null;
    try {
      return await this.deps.loadProfile();
    } catch {
      return null;
    }
  }

  async listAgents(principalId: string, actingUserId: string): Promise<PeerAgent[]> {
    return (await this.listAgentsWithUnit(principalId, actingUserId)).agents;
  }

  /** Exposed agents plus this Unit's identity & role, for paired peers only. */
  async listAgentsWithUnit(principalId: string, actingUserId: string): Promise<{ agents: PeerAgent[]; unit: PeerUnitProfile | null }> {
    const { peer, user } = await this.resolveCaller(principalId, actingUserId);
    const agents = await this.exposedAgents(user);
    const profile = await this.loadProfile();
    await this.deps.audit.record({
      direction: 'inbound', peerId: peer.id, principalId, userId: user.id,
      capability: 'federation.agents.list', outcome: 'ok', httpStatus: 200,
    });
    return { agents, unit: profile ? toPeerProfile(profile) : null };
  }

  async ask(params: { principalId: string; actingUserId: string; agent: string; question: string }) {
    const started = this.now();
    const { peer, user } = await this.resolveCaller(params.principalId, params.actingUserId);
    const audit = {
      direction: 'inbound' as const, peerId: peer.id, principalId: params.principalId, userId: user.id,
      capability: 'federation.agents.ask', target: params.agent.slice(0, 100),
    };

    const agents = await this.exposedAgents(user);
    if (!agents.some(agent => agent.id === params.agent)) {
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 404, errorCode: 'agent_not_found' });
      throw federationErrors.agentNotFound();
    }

    const peerLimit = this.deps.acquire('federation-ask', `principal:${params.principalId}`);
    if (!peerLimit.allowed) {
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' });
      throw new FederationRateLimitedError(peerLimit.retryAfterSeconds, peerLimit.headers);
    }
    const chatLimit = this.deps.acquire('chat', user.id);
    if (!chatLimit.allowed) {
      peerLimit.lease.release();
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' });
      throw new FederationRateLimitedError(chatLimit.retryAfterSeconds, chatLimit.headers);
    }

    try {
      const model = await this.deps.runtime.resolveModel(user.id, params.agent);
      if (!model) throw new FederationError('provider_not_configured', 'No model is configured for this agent', 422);

      const conversationId = await this.deps.runtime.findOrCreateConversation(
        user.id, params.agent, `Federation · ${peer.displayName ?? peer.unitName}`,
      );
      const result = await withTimeout(this.deps.runtime.runChat({
        user,
        conversationId,
        domain: params.agent,
        message: params.question,
        modelId: model.modelId,
        provider: model.provider,
        locale: 'en',
      }), ASK_SERVER_TIMEOUT_MS);

      const truncated = result.content.length > MAX_ANSWER_CHARS;
      const answer = truncated ? result.content.slice(0, MAX_ANSWER_CHARS) : result.content;
      await this.deps.audit.record({
        ...audit, outcome: 'ok', httpStatus: 200, durationMs: this.now() - started,
        requestBytes: params.question.length, responseBytes: answer.length,
      });
      return { answer, truncated };
    } catch (error) {
      const code = error instanceof FederationError ? error.code : 'internal_error';
      await this.deps.audit.record({ ...audit, outcome: 'error', errorCode: code, durationMs: this.now() - started });
      throw error;
    } finally {
      peerLimit.lease.release();
      chatLimit.lease.release();
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FederationError('timeout', 'The agent did not answer in time', 504)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
