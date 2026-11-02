/**
 * Shared federation client (roadmap P3).
 *
 * The only code allowed to call paired peers. Every call:
 *  - requires an active peer and a capability the peer granted us;
 *  - decrypts the stored peer key in memory only;
 *  - goes through PeerClient (timeouts, size limit, no redirects);
 *  - is written to the federation audit log (metadata only).
 */
import { z } from 'zod';
import type { FederationAuditSink } from './audit.repository';
import { FEDERATION_CAPABILITIES } from './capabilities';
import { FederationError, federationErrors } from './errors';
import type { SecretBox } from './pairing.service';
import type { PeerClient } from './peer-client';
import type { PeerRecord, PeerStore } from './peer.types';
import { federationStatusSchema, type FederationStatus } from './status.schema';
import { peerUnitProfileSchema, type PeerUnitProfile } from './unit-profile';

export const LIST_TIMEOUT_MS = 8_000;
export const ASK_TIMEOUT_MS = 60_000;
/** P4c: an async ask only waits for the peer to accept (or answer from its store). */
export const ASYNC_ASK_TIMEOUT_MS = 15_000;
export const ASK_RESULT_TIMEOUT_MS = 8_000;
/** P4d: Control Tower heartbeat timeout. */
export const STATUS_TIMEOUT_MS = 3_000;

export const peerAgentSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
});
export type PeerAgent = z.infer<typeof peerAgentSchema>;

const listResponseSchema = z.object({
  agents: z.array(peerAgentSchema).max(100),
  // Older Units (before P3.5) do not send `unit`; a malformed one is ignored.
  unit: z.unknown().optional(),
  // P4c: ask protocol version; absent on older Units (sync only).
  protocol: z.object({ ask: z.number().int().optional() }).passthrough().optional().catch(undefined),
  // P4d: capabilities our key holds on the peer; absent on older Units.
  granted_capabilities: z.array(z.string().max(64)).max(20).optional().catch(undefined),
  // Data page ids of the peer's agent; absent on older Units (then no pages are shown).
  pages: z.array(z.string().regex(/^[a-z0-9_-]{1,32}$/)).max(20).optional().catch(undefined),
});
const askResponseSchema = z.object({
  answer: z.string(),
  truncated: z.boolean(),
  // P4b; older peers omit them (no remote continuity).
  conversation_id: z.string().min(1).max(100).nullable().optional(),
  message_id: z.string().min(1).max(100).nullable().optional(),
});

const asyncAskResponseSchema = z.union([
  askResponseSchema.extend({ status: z.literal('done') }),
  z.object({ status: z.literal('pending'), poll_after_ms: z.number().int().min(0).max(600_000).optional() }),
  z.object({ status: z.literal('failed'), error_code: z.string().max(64).nullable().optional() }),
]);

export type AsyncAskOutcome =
  | { status: 'done'; result: ConversationAskResult }
  | { status: 'pending'; pollAfterMs: number | null }
  | { status: 'failed'; errorCode: string };

export interface ConversationAskResult {
  answer: string;
  truncated: boolean;
  /** Null when the peer does not support continuity (pre-P4b). */
  conversationId: string | null;
  messageId: string | null;
}

export interface FederationCallContext {
  /** Local user who triggered the call (audit). */
  initiatedByUserId: string | null;
  /** Unified inbox thread, written to the audit log (P4a). */
  threadId?: string | null;
}

export interface FederationClientDeps {
  store: PeerStore;
  transport: PeerClient;
  secrets: SecretBox;
  audit: FederationAuditSink;
  now?: () => number;
}

export interface PeerSummary {
  id: string;
  unitName: string;
  displayName: string | null;
  capabilities: string[];
}

/** Ask protocol v3 flags; only sent to peers that advertise `protocol.ask >= 3`. */
export interface AskV3Flags {
  primary?: boolean;
  topicReset?: boolean;
}

function askBody(input: { question: string; conversationId: string | null; threadTitle?: string | null; timeZone?: string | null } & AskV3Flags) {
  return {
    question: input.question,
    // v3 primary asks carry no conversation id; older peers get it exactly as before.
    ...(input.primary ? { primary: true } : { conversation_id: input.conversationId }),
    ...(input.topicReset ? { topic_reset: true } : {}),
    ...(input.threadTitle ? { thread_title: input.threadTitle.slice(0, 200) } : {}),
    ...(input.timeZone ? { timezone: input.timeZone.slice(0, 64) } : {}),
  };
}

export class FederationClient {
  private readonly now: () => number;

  constructor(private readonly deps: FederationClientDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Active peers, without secrets. */
  async listActivePeers(): Promise<PeerSummary[]> {
    const peers = await this.deps.store.list();
    return peers
      .filter(peer => peer.status === 'active')
      .map(peer => ({
        id: peer.id,
        unitName: peer.unitName,
        displayName: peer.displayName,
        capabilities: peer.outboundCapabilities,
      }));
  }

  /** Resolves an active peer by unit name (case-insensitive) or id. */
  async findActivePeer(nameOrId: string): Promise<PeerRecord | null> {
    const wanted = nameOrId.trim().toLowerCase();
    const peers = await this.deps.store.list();
    return peers.find(peer => peer.status === 'active'
      && (peer.id === nameOrId || peer.unitName.toLowerCase() === wanted)) ?? null;
  }

  async listAgents(peerId: string, ctx: FederationCallContext): Promise<PeerAgent[]> {
    return (await this.listAgentsWithUnit(peerId, ctx)).agents;
  }

  /** Agents plus the peer's identity & role (null for older Units). */
  async listAgentsWithUnit(
    peerId: string, ctx: FederationCallContext, options: { timeoutMs?: number; auditOk?: boolean } = {},
  ): Promise<{ agents: PeerAgent[]; unit: PeerUnitProfile | null; askVersion?: number; grantedCapabilities?: string[]; pages?: string[] }> {
    const data = await this.call({
      peerId, ctx, capability: 'federation.agents.list', target: null,
      path: '/api/v1/federation/agents', method: 'GET', timeoutMs: options.timeoutMs ?? LIST_TIMEOUT_MS,
      auditOk: options.auditOk,
    });
    const parsed = listResponseSchema.safeParse(data);
    if (!parsed.success) throw federationErrors.peerInvalidResponse();
    const unit = peerUnitProfileSchema.safeParse(parsed.data.unit);
    return {
      agents: parsed.data.agents, unit: unit.success ? unit.data : null, askVersion: parsed.data.protocol?.ask ?? 1,
      ...(parsed.data.granted_capabilities ? { grantedCapabilities: parsed.data.granted_capabilities } : {}),
      ...(parsed.data.pages ? { pages: parsed.data.pages } : {}),
    };
  }

  /**
   * Control Tower status (P4d). Successful reads are not audited (the
   * heartbeat runs every minute); failures and denials are.
   */
  async getStatus(peerId: string, ctx: FederationCallContext, timeoutMs = STATUS_TIMEOUT_MS): Promise<FederationStatus> {
    const data = await this.call({
      peerId, ctx, capability: 'federation.status.read', target: null,
      path: '/api/v1/federation/status', method: 'GET', timeoutMs, auditOk: false,
    });
    const parsed = federationStatusSchema.safeParse(data);
    if (!parsed.success) throw federationErrors.peerInvalidResponse();
    return parsed.data;
  }

  /**
   * Updates what we may call on a peer from its `granted_capabilities` (P4d),
   * so grants changed in place on the peer apply without re-pairing. Unknown
   * ids are dropped. Returns the new list when it changed.
   */
  async syncGrantedCapabilities(peerId: string, granted: readonly string[]): Promise<string[] | null> {
    const peer = await this.deps.store.get(peerId);
    if (!peer || peer.status !== 'active') return null;
    const known = new Set(FEDERATION_CAPABILITIES.map(capability => capability.id as string));
    const next = Array.from(new Set(granted.filter(id => known.has(id)))).sort();
    const current = [...peer.outboundCapabilities].sort();
    if (next.length === current.length && next.every((id, index) => id === current[index])) return null;
    await this.deps.store.update(peer.id, { outboundCapabilities: next });
    return next;
  }

  /**
   * Async ask (P4c, peers with ask protocol >= 2). Returns at once with the
   * answer (fast path or stored replay) or `pending`; poll getAskResult().
   */
  async askAgentAsync(
    peerId: string,
    agent: string,
    input: { question: string; conversationId: string | null; threadTitle?: string | null; idempotencyKey: string; timeZone?: string | null } & AskV3Flags,
    ctx: FederationCallContext,
  ): Promise<AsyncAskOutcome> {
    const data = await this.call({
      peerId, ctx, capability: 'federation.agents.ask', target: agent,
      path: `/api/v1/federation/agents/${encodeURIComponent(agent)}/ask?async=1`,
      method: 'POST',
      body: askBody(input),
      headers: { 'Idempotency-Key': input.idempotencyKey },
      timeoutMs: ASYNC_ASK_TIMEOUT_MS,
    });
    return parseAsyncOutcome(data);
  }

  /** Reads an async ask's state by its Idempotency-Key (P4c). */
  async getAskResult(peerId: string, key: string, ctx: FederationCallContext): Promise<AsyncAskOutcome> {
    const data = await this.call({
      peerId, ctx, capability: 'federation.agents.ask', target: 'ask-result',
      path: `/api/v1/federation/asks/${encodeURIComponent(key)}`,
      method: 'GET',
      timeoutMs: ASK_RESULT_TIMEOUT_MS,
    });
    return parseAsyncOutcome(data);
  }

  async askAgent(peerId: string, agent: string, question: string, ctx: FederationCallContext) {
    const data = await this.call({
      peerId, ctx, capability: 'federation.agents.ask', target: agent,
      path: `/api/v1/federation/agents/${encodeURIComponent(agent)}/ask`,
      method: 'POST', body: { question }, timeoutMs: ASK_TIMEOUT_MS,
    });
    const parsed = askResponseSchema.safeParse(data);
    if (!parsed.success) throw federationErrors.peerInvalidResponse();
    return { answer: parsed.data.answer, truncated: parsed.data.truncated };
  }

  /**
   * Ask within a remote conversation (P4b). `conversationId: null` starts a new
   * one. The idempotency key lets the peer replay a reply on retry.
   */
  async askAgentInConversation(
    peerId: string,
    agent: string,
    input: { question: string; conversationId: string | null; threadTitle?: string | null; idempotencyKey?: string | null; timeZone?: string | null } & AskV3Flags,
    ctx: FederationCallContext,
  ): Promise<ConversationAskResult> {
    const data = await this.call({
      peerId, ctx, capability: 'federation.agents.ask', target: agent,
      path: `/api/v1/federation/agents/${encodeURIComponent(agent)}/ask`,
      method: 'POST',
      body: askBody(input),
      headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
      timeoutMs: ASK_TIMEOUT_MS,
    });
    const parsed = askResponseSchema.safeParse(data);
    if (!parsed.success) throw federationErrors.peerInvalidResponse();
    return {
      answer: parsed.data.answer,
      truncated: parsed.data.truncated,
      conversationId: parsed.data.conversation_id ?? null,
      messageId: parsed.data.message_id ?? null,
    };
  }

  private async call(params: {
    peerId: string;
    ctx: FederationCallContext;
    capability: string;
    target: string | null;
    path: string;
    method: 'GET' | 'POST';
    body?: unknown;
    headers?: Record<string, string>;
    timeoutMs: number;
    /** False skips the audit row on success (high-frequency probes); failures are always audited. */
    auditOk?: boolean;
  }): Promise<unknown> {
    const started = this.now();
    const peer = await this.deps.store.get(params.peerId);
    const base = {
      direction: 'outbound' as const,
      peerId: peer?.id ?? null,
      userId: params.ctx.initiatedByUserId,
      capability: params.capability,
      target: params.target,
      ...(params.ctx.threadId ? { threadId: params.ctx.threadId } : {}),
    };

    if (!peer || peer.status !== 'active' || !peer.outboundKeyEncrypted) {
      await this.deps.audit.record({ ...base, outcome: 'denied', errorCode: 'peer_not_active' });
      throw federationErrors.peerNotActive();
    }
    if (!peer.outboundCapabilities.includes(params.capability)) {
      await this.deps.audit.record({ ...base, outcome: 'denied', errorCode: 'capability_not_granted' });
      throw federationErrors.capabilityNotGranted(params.capability);
    }

    try {
      const result = await this.deps.transport.callPeer({
        origin: peer.origin,
        path: params.path,
        key: this.deps.secrets.decrypt(peer.outboundKeyEncrypted),
        method: params.method,
        body: params.body,
        ...(params.headers ? { headers: params.headers } : {}),
        timeoutMs: params.timeoutMs,
      });
      await this.deps.store.update(peer.id, { lastSeenAt: new Date(this.now()) });
      if (params.auditOk !== false) await this.deps.audit.record({
        ...base, outcome: 'ok', httpStatus: result.status, durationMs: this.now() - started,
        requestBytes: result.requestBytes, responseBytes: result.responseBytes,
      });
      return result.data;
    } catch (error) {
      const code = error instanceof FederationError ? error.code : 'internal_error';
      await this.deps.audit.record({
        ...base,
        outcome: code === 'peer_access_denied' ? 'denied' : 'error',
        errorCode: code,
        durationMs: this.now() - started,
      });
      throw error;
    }
  }
}

function parseAsyncOutcome(data: unknown): AsyncAskOutcome {
  const parsed = asyncAskResponseSchema.safeParse(data);
  if (!parsed.success) throw federationErrors.peerInvalidResponse();
  const value = parsed.data;
  if (value.status === 'pending') return { status: 'pending', pollAfterMs: value.poll_after_ms ?? null };
  if (value.status === 'failed') return { status: 'failed', errorCode: value.error_code ?? 'failed' };
  return {
    status: 'done',
    result: {
      answer: value.answer, truncated: value.truncated,
      conversationId: value.conversation_id ?? null, messageId: value.message_id ?? null,
    },
  };
}
