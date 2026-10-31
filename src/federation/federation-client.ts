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
import { FederationError, federationErrors } from './errors';
import type { SecretBox } from './pairing.service';
import type { PeerClient } from './peer-client';
import type { PeerRecord, PeerStore } from './peer.types';
import { peerUnitProfileSchema, type PeerUnitProfile } from './unit-profile';

export const LIST_TIMEOUT_MS = 8_000;
export const ASK_TIMEOUT_MS = 60_000;

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
});
const askResponseSchema = z.object({
  answer: z.string(),
  truncated: z.boolean(),
  // P4b; older peers omit them (no remote continuity).
  conversation_id: z.string().min(1).max(100).nullable().optional(),
  message_id: z.string().min(1).max(100).nullable().optional(),
});

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
  async listAgentsWithUnit(peerId: string, ctx: FederationCallContext): Promise<{ agents: PeerAgent[]; unit: PeerUnitProfile | null }> {
    const data = await this.call({
      peerId, ctx, capability: 'federation.agents.list', target: null,
      path: '/api/v1/federation/agents', method: 'GET', timeoutMs: LIST_TIMEOUT_MS,
    });
    const parsed = listResponseSchema.safeParse(data);
    if (!parsed.success) throw federationErrors.peerInvalidResponse();
    const unit = peerUnitProfileSchema.safeParse(parsed.data.unit);
    return { agents: parsed.data.agents, unit: unit.success ? unit.data : null };
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
    input: { question: string; conversationId: string | null; threadTitle?: string | null; idempotencyKey?: string | null },
    ctx: FederationCallContext,
  ): Promise<ConversationAskResult> {
    const data = await this.call({
      peerId, ctx, capability: 'federation.agents.ask', target: agent,
      path: `/api/v1/federation/agents/${encodeURIComponent(agent)}/ask`,
      method: 'POST',
      body: {
        question: input.question,
        conversation_id: input.conversationId,
        ...(input.threadTitle ? { thread_title: input.threadTitle.slice(0, 200) } : {}),
      },
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
      await this.deps.audit.record({
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
