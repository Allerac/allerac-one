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
import { askRequestHash, type AskDedupeStore } from './ask-dedupe';
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
  /** Legacy (pre-P4b callers that send no conversation_id): one shared conversation per title. */
  findOrCreateConversation(userId: string, slug: string, title: string): Promise<string>;
  /** P4b: a new federated conversation owned by the calling principal. */
  createFederatedConversation(params: { userId: string; slug: string; principalId: string; title: string }): Promise<string>;
  /** P4b: true only if the conversation exists, is federated, and belongs to this principal, user and agent. */
  ownsFederatedConversation(params: { id: string; userId: string; slug: string; principalId: string }): Promise<boolean>;
  resolveModel(userId: string, slug: string): Promise<{ modelId: string; provider: string } | null>;
  runChat(input: {
    user: User;
    conversationId: string;
    domain: string;
    message: string;
    modelId: string;
    provider: string;
    locale: string;
  }): Promise<{ content: string; messageId?: string | null }>;
}

type Acquire = (operation: 'federation-ask' | 'chat', subject: string) => OperationLimitResult;

export interface AgentsServiceDeps {
  runtime: AgentsRuntime;
  store: PeerStore;
  audit: FederationAuditSink;
  acquire: Acquire;
  /** Idempotency-Key store (P4b). Optional so older wiring keeps working. */
  dedupe?: AskDedupeStore;
  /** Unit identity & role (P3.5). Optional so older wiring keeps working. */
  loadProfile?: () => Promise<UnitProfile>;
  env?: Env;
  now?: () => number;
}

export const MAX_TITLE_CHARS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AskParams {
  principalId: string;
  actingUserId: string;
  agent: string;
  question: string;
  /** P4b: undefined = legacy caller, null = start a new conversation, string = continue it. */
  conversationId?: string | null;
  /** P4b: home thread title, used for the peer-side conversation title. */
  threadTitle?: string | null;
  idempotencyKey?: string | null;
}

export interface AskResult {
  answer: string;
  truncated: boolean;
  /** Null for legacy callers (no continuity handle). */
  conversation_id: string | null;
  message_id: string | null;
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

  async ask(params: AskParams): Promise<AskResult> {
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

    const conversationId = params.conversationId;
    if (typeof conversationId === 'string') {
      const owned = UUID.test(conversationId) && await this.deps.runtime.ownsFederatedConversation({
        id: conversationId, userId: user.id, slug: params.agent, principalId: params.principalId,
      });
      if (!owned) {
        await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 404, errorCode: 'conversation_not_found' });
        throw federationErrors.conversationNotFound();
      }
    }

    const key = params.idempotencyKey && this.deps.dedupe ? params.idempotencyKey : null;
    if (key) {
      const begin = await this.deps.dedupe!.begin(
        params.principalId, key, askRequestHash({ agent: params.agent, conversationId, question: params.question }), new Date(this.now()),
      );
      if (begin.kind === 'replay') {
        await this.deps.audit.record({ ...audit, outcome: 'ok', httpStatus: 200, errorCode: 'replayed', durationMs: this.now() - started });
        return {
          answer: begin.response.answer, truncated: begin.response.truncated,
          conversation_id: begin.response.conversation_id, message_id: begin.response.message_id,
        };
      }
      if (begin.kind !== 'new') {
        const error = begin.kind === 'mismatch' ? federationErrors.idempotencyKeyReused() : federationErrors.askInProgress();
        await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: error.status, errorCode: error.code });
        throw error;
      }
    }
    const fail = async () => { if (key) await this.deps.dedupe!.finish(params.principalId, key, { status: 'failed' }).catch(() => undefined); };

    const peerLimit = this.deps.acquire('federation-ask', `principal:${params.principalId}`);
    if (!peerLimit.allowed) {
      await fail();
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' });
      throw new FederationRateLimitedError(peerLimit.retryAfterSeconds, peerLimit.headers);
    }
    const chatLimit = this.deps.acquire('chat', user.id);
    if (!chatLimit.allowed) {
      peerLimit.lease.release();
      await fail();
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' });
      throw new FederationRateLimitedError(chatLimit.retryAfterSeconds, chatLimit.headers);
    }

    try {
      const model = await this.deps.runtime.resolveModel(user.id, params.agent);
      if (!model) throw new FederationError('provider_not_configured', 'No model is configured for this agent', 422);

      const unitLabel = `Federation · ${peer.displayName ?? peer.unitName}`;
      let targetId: string;
      if (typeof conversationId === 'string') {
        targetId = conversationId;
      } else if (conversationId === null) {
        const threadTitle = params.threadTitle?.trim();
        targetId = await this.deps.runtime.createFederatedConversation({
          userId: user.id, slug: params.agent, principalId: params.principalId,
          title: (threadTitle ? `${unitLabel} · ${threadTitle}` : unitLabel).slice(0, MAX_TITLE_CHARS),
        });
      } else {
        // Older home Units send no conversation_id: keep the P4a shared conversation.
        targetId = await this.deps.runtime.findOrCreateConversation(user.id, params.agent, unitLabel);
      }
      const result = await withTimeout(this.deps.runtime.runChat({
        user,
        conversationId: targetId,
        domain: params.agent,
        message: params.question,
        modelId: model.modelId,
        provider: model.provider,
        locale: 'en',
      }), ASK_SERVER_TIMEOUT_MS);

      const truncated = result.content.length > MAX_ANSWER_CHARS;
      const answer = truncated ? result.content.slice(0, MAX_ANSWER_CHARS) : result.content;
      const response: AskResult = {
        answer, truncated,
        conversation_id: conversationId === undefined ? null : targetId,
        message_id: result.messageId ?? null,
      };
      if (key) await this.deps.dedupe!.finish(params.principalId, key, { status: 'done', response });
      await this.deps.audit.record({
        ...audit, outcome: 'ok', httpStatus: 200, durationMs: this.now() - started,
        requestBytes: params.question.length, responseBytes: answer.length,
      });
      return response;
    } catch (error) {
      await fail();
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
