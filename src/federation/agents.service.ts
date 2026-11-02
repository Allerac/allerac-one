import { isValidTimeZone } from '@/app/lib/timezone';
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
import { askRequestHash, type AskDedupeStore, type AskResultState, type DedupeMode } from './ask-dedupe';
import type { FederationAuditSink } from './audit.repository';
import { exposedAgentSlugs, singleAgent, type Env } from './env';
import { FederationError, federationErrors } from './errors';
import type { PeerAgent } from './federation-client';
import type { PeerRecord, PeerStore } from './peer.types';
import { toPeerProfile, type PeerUnitProfile, type UnitProfile } from './unit-profile';

export const MAX_QUESTION_CHARS = 4_000;
export const MAX_ANSWER_CHARS = 8_000;
export const ASK_SERVER_TIMEOUT_MS = 55_000;
/** P4c: background (async) asks may run this long before they read as timed out. */
export const ASYNC_ASK_DEADLINE_MS = 10 * 60 * 1000;
export const DEFAULT_ASYNC_MAX_RUNNING = 4;
/** P4c: ask protocol version advertised in the agents list (2 = async + GET /asks/:key). */
export const ASK_PROTOCOL_VERSION = 2;

export interface AgentsRuntime {
  loadUser(userId: string): Promise<User | null>;
  listActiveDomains(slugs: string[]): Promise<Array<{ slug: string; displayName: string }>>;
  canAccessDomain(user: User, slug: string): Promise<boolean>;
  /**
   * Legacy (pre-P4b callers that send no conversation_id). Phase 4a: appends to
   * the principal's primary federated conversation for this agent.
   */
  findOrCreateConversation(userId: string, slug: string, title: string, principalId?: string): Promise<string>;
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
    timeZone?: string;
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
  /** P4c: keeps a background ask alive (tests can await it). Default: fire and forget. */
  runInBackground?: (task: Promise<void>) => void;
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
  /** IANA timezone of the asking user (home Unit); used for "today" when valid. */
  timeZone?: string | null;
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
  private asyncRunning = 0;

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
    const profile = await this.loadProfile();
    const descriptions = profile?.agentDescriptions ?? {};
    const single = singleAgent(this.env);
    const agents: PeerAgent[] = [];
    for (const domain of domains) {
      if (!await this.deps.runtime.canAccessDomain(user, domain.slug)) continue;
      const description = (single ? profile?.role ?? descriptions[domain.slug] : descriptions[domain.slug])?.slice(0, 500) || null;
      // Single agent: peers see the Unit's own name, not the domain's.
      agents.push({ id: domain.slug, name: single && profile ? profile.displayName : domain.displayName, description });
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

  /** Synchronous ask: waits up to ASK_SERVER_TIMEOUT_MS for the answer. */
  async ask(params: AskParams): Promise<AskResult> {
    const prepared = await this.prepare(params, 'sync');
    if (prepared.kind === 'replay') return prepared.response;
    if (prepared.kind === 'pending') throw federationErrors.askInProgress();
    const run = await this.claimSlots(prepared, false);
    return this.execute(prepared, run, ASK_SERVER_TIMEOUT_MS);
  }

  /**
   * Async ask (P4c): claims the Idempotency-Key, starts the turn in the
   * background (deadline ASYNC_ASK_DEADLINE_MS) and returns at once. The home
   * fetches the result with getAskResult(). A repeat returns the stored state.
   */
  async askAsync(params: AskParams): Promise<{ status: 'done'; result: AskResult } | { status: 'pending' }> {
    if (!params.idempotencyKey || !this.deps.dedupe) {
      throw new FederationError('validation_error', 'Idempotency-Key is required for async asks', 400);
    }
    const prepared = await this.prepare(params, 'async');
    if (prepared.kind === 'replay') return { status: 'done', result: prepared.response };
    if (prepared.kind === 'pending') return { status: 'pending' };
    const run = await this.claimSlots(prepared, true);
    const background = this.execute(prepared, run, ASYNC_ASK_DEADLINE_MS)
      .then(() => undefined, () => undefined)
      .finally(() => { this.asyncRunning -= 1; });
    (this.deps.runInBackground ?? (task => { void task; }))(background);
    return { status: 'pending' };
  }

  /** Result of an async (or sync) ask by key, for the same principal only. */
  async getAskResult(principalId: string, actingUserId: string, key: string): Promise<AskResultState> {
    await this.resolveCaller(principalId, actingUserId);
    const state = this.deps.dedupe ? await this.deps.dedupe.get(principalId, key, new Date(this.now())) : null;
    if (!state) throw new FederationError('ask_not_found', 'Ask not found', 404);
    return state;
  }

  /** Number of async asks currently running in this process. */
  get runningAsyncAsks(): number {
    return this.asyncRunning;
  }

  private async prepare(params: AskParams, mode: DedupeMode): Promise<
    | { kind: 'replay'; response: AskResult }
    | { kind: 'pending' }
    | PreparedAsk
  > {
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
      const now = new Date(this.now());
      const begin = await this.deps.dedupe!.begin(
        params.principalId, key, askRequestHash({ agent: params.agent, conversationId, question: params.question }), now,
        mode === 'async' ? { mode, deadlineAt: new Date(now.getTime() + ASYNC_ASK_DEADLINE_MS) } : { mode },
      );
      if (begin.kind === 'replay') {
        await this.deps.audit.record({ ...audit, outcome: 'ok', httpStatus: 200, errorCode: 'replayed', durationMs: this.now() - started });
        return {
          kind: 'replay',
          response: {
            answer: begin.response.answer, truncated: begin.response.truncated,
            conversation_id: begin.response.conversation_id, message_id: begin.response.message_id,
          },
        };
      }
      if (begin.kind === 'in_progress') return { kind: 'pending' };
      if (begin.kind === 'mismatch') {
        const error = federationErrors.idempotencyKeyReused();
        await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: error.status, errorCode: error.code });
        throw error;
      }
    }
    return { kind: 'run', params, peer, user, audit, key, started };
  }

  private async fail(prepared: PreparedAsk, errorCode: string) {
    if (prepared.key) {
      await this.deps.dedupe!.finish(prepared.params.principalId, prepared.key, { status: 'failed', errorCode }).catch(() => undefined);
    }
  }

  private async claimSlots(prepared: PreparedAsk, async: boolean): Promise<{ release: () => void }> {
    const { params, user, audit } = prepared;
    if (async && this.asyncRunning >= this.asyncCap()) {
      await this.fail(prepared, 'rate_limited');
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' });
      throw new FederationRateLimitedError(30, { 'Retry-After': '30' });
    }
    const peerLimit = this.deps.acquire('federation-ask', `principal:${params.principalId}`);
    if (!peerLimit.allowed) {
      await this.fail(prepared, 'rate_limited');
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' });
      throw new FederationRateLimitedError(peerLimit.retryAfterSeconds, peerLimit.headers);
    }
    const chatLimit = this.deps.acquire('chat', user.id);
    if (!chatLimit.allowed) {
      peerLimit.lease.release();
      await this.fail(prepared, 'rate_limited');
      await this.deps.audit.record({ ...audit, outcome: 'denied', httpStatus: 429, errorCode: 'rate_limited' });
      throw new FederationRateLimitedError(chatLimit.retryAfterSeconds, chatLimit.headers);
    }
    if (async) this.asyncRunning += 1;
    return { release: () => { peerLimit.lease.release(); chatLimit.lease.release(); } };
  }

  private asyncCap(): number {
    const value = Number.parseInt(this.env.FEDERATION_ASYNC_MAX_RUNNING ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_ASYNC_MAX_RUNNING;
  }

  private async execute(prepared: PreparedAsk, run: { release: () => void }, timeoutMs: number): Promise<AskResult> {
    const { params, peer, user, audit, key, started } = prepared;
    const conversationId = params.conversationId;
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
        // Older home Units send no conversation_id: append to the principal's primary conversation.
        targetId = await this.deps.runtime.findOrCreateConversation(user.id, params.agent, unitLabel, params.principalId);
      }
      const result = await withTimeout(this.deps.runtime.runChat({
        user,
        conversationId: targetId,
        domain: params.agent,
        message: params.question,
        modelId: model.modelId,
        provider: model.provider,
        locale: 'en',
        ...(isValidTimeZone(params.timeZone) ? { timeZone: params.timeZone } : {}),
      }), timeoutMs);

      if (!result.content.trim()) {
        // Never deliver a blank answer as success: the home shows it as an error.
        console.log(`[Federation] ${JSON.stringify({ event: 'empty_answer', peerId: peer.id, agent: params.agent })}`);
        throw new FederationError('empty_answer', 'The agent returned an empty answer', 502);
      }

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
      const code = error instanceof FederationError ? error.code : 'internal_error';
      await this.fail(prepared, code);
      await this.deps.audit.record({ ...audit, outcome: 'error', errorCode: code, durationMs: this.now() - started });
      throw error;
    } finally {
      run.release();
    }
  }
}

interface PreparedAsk {
  kind: 'run';
  params: AskParams;
  peer: PeerRecord;
  user: User;
  audit: {
    direction: 'inbound'; peerId: string; principalId: string; userId: string; capability: string; target: string;
  };
  key: string | null;
  started: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FederationError('timeout', 'The agent did not answer in time', 504)), ms);
    // Never keep the process alive just for this timer (async asks wait up to 10 min).
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
