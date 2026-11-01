/**
 * Unified inbox (federation P4a): one list of local agents plus each paired
 * Unit's exposed agents, and a 1:1 thread per remote agent.
 *
 * - Remote calls go through FederationClient only (keys never leave the server).
 * - Replies are synchronous (FederationClient ASK timeout, 60s). Async runs are P4c.
 * - Continuity (P4b): the peer keeps the conversation; the thread stores its
 *   `remote_conversation_id` and only the new message is sent. The last few
 *   turns are packed into the question only when there is no handle yet (a
 *   P4a thread's first P4b send, a context reset, or a pre-P4b peer).
 * - Every ask carries an Idempotency-Key (the local message id) so a retry
 *   replays the peer's stored reply instead of running the agent twice.
 * - Remote text is stored only in federated_* tables, never in chat_conversations,
 *   so local memory/RAG never sees it. It is untrusted and rendered as plain text.
 */
import { MAX_QUESTION_CHARS } from './agents.service';
import { FederationError } from './errors';
import { ASK_TIMEOUT_MS, type AsyncAskOutcome, type ConversationAskResult, type PeerAgent } from './federation-client';
import type { FederatedMessage, FederatedThread, InboxStore } from './inbox.types';
import type { PeerRecord, PeerStore } from './peer.types';
import type { PeerUnitProfile } from './unit-profile';

export const CONTEXT_TURNS = 6;
export const CONTEXT_ITEM_CHARS = 1_000;
export const AGENT_LIST_CACHE_MS = 30_000;
export const PEER_SENDS_PER_MINUTE = 10;
export const THREAD_PAGE_SIZE = 50;
export const MAX_THREAD_TITLE_CHARS = 200;
/** P4c: how long a pending async message is polled before it reads as timed out (peer deadline + slack). */
export const PENDING_DEADLINE_MS = 11 * 60 * 1000;
/** P4c: poll backoff (ms) by attempt; the last value repeats. ±20% jitter is applied. */
export const POLL_BACKOFF_MS = [3_000, 3_000, 5_000, 10_000, 15_000, 30_000];
export const POLL_JITTER = 0.2;
/** P4c: peer result reads per client request (the background sweep has its own bound). */
export const POLLS_PER_REQUEST = 5;
export const POLLS_PER_SWEEP = 50;
/** Lease while one poll is in flight, so the sweep and a request do not poll the same message. */
const POLL_LEASE_MS = 30_000;
/** Consecutive local (non-peer) poll failures before a pending message is failed (P4c). */
export const LOCAL_POLL_FAILURE_LIMIT = 3;
/** Peer transport errors: the peer may answer later, so polling continues with backoff. */
const RETRYABLE_PEER_ERRORS = new Set(['peer_unreachable', 'peer_rate_limited', 'peer_error', 'peer_invalid_response', 'timeout']);

/** Delay before poll number `attempt` (0-based), with jitter in [-POLL_JITTER, +POLL_JITTER]. */
export function pollDelay(attempt: number, random: () => number = Math.random): number {
  const base = POLL_BACKOFF_MS[Math.min(Math.max(attempt, 0), POLL_BACKOFF_MS.length - 1)];
  return Math.round(base * (1 + (random() * 2 - 1) * POLL_JITTER));
}
const PREVIEW_CHARS = 140;
const AGENT_SLUG = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InboxError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = 'InboxError';
  }
}

/** The subset of FederationClient the inbox needs. */
export interface InboxFederationPort {
  listAgentsWithUnit(peerId: string, ctx: { initiatedByUserId: string | null }): Promise<{ agents: PeerAgent[]; unit: PeerUnitProfile | null; askVersion?: number }>;
  askAgentInConversation(
    peerId: string,
    agent: string,
    input: { question: string; conversationId: string | null; threadTitle?: string | null; idempotencyKey?: string | null },
    ctx: { initiatedByUserId: string | null; threadId?: string | null },
  ): Promise<{ answer: string; truncated: boolean; conversationId: string | null; messageId: string | null }>;
  /** P4c (peers with ask protocol >= 2). Optional so older wiring keeps working. */
  askAgentAsync?(
    peerId: string,
    agent: string,
    input: { question: string; conversationId: string | null; threadTitle?: string | null; idempotencyKey: string },
    ctx: { initiatedByUserId: string | null; threadId?: string | null },
  ): Promise<AsyncAskOutcome>;
  getAskResult?(peerId: string, key: string, ctx: { initiatedByUserId: string | null; threadId?: string | null }): Promise<AsyncAskOutcome>;
}

export interface InboxUser {
  id: string;
  is_admin?: boolean;
}

export interface InboxServiceDeps {
  store: InboxStore;
  peers: PeerStore;
  federation: InboxFederationPort;
  /** Unused since the Agents redesign: local domains are not agents (kept optional for callers). */
  localAgents?(user: InboxUser): Promise<Array<{ slug: string; name: string }>>;
  loadHomeUnit(): Promise<PeerUnitProfile>;
  /** Heartbeat state per peer id from the Control Tower (P4d); fresher than the list probe. */
  beatStates?(): Promise<Map<string, { state: 'unknown' | 'online' | 'degraded' | 'offline'; at: Date | null }>>;
  now?: () => number;
  log?: (line: string) => void;
  /** Jitter source for poll backoff (tests pass a fixed value). */
  random?: () => number;
}

/** A heartbeat older than this is ignored in favour of the live list probe. */
export const BEAT_FRESH_MS = 3 * 60 * 1000;

export function unitStatus(
  answered: boolean, beat: { state: string; at: Date | null } | null, now: number,
): 'online' | 'degraded' | 'offline' {
  const fresh = beat?.at && now - new Date(beat.at).getTime() < BEAT_FRESH_MS;
  if (fresh && (beat.state === 'online' || beat.state === 'degraded' || beat.state === 'offline')) {
    // The list call just answered, so the unit is at least reachable.
    if (beat.state === 'offline' && answered) return 'degraded';
    return beat.state;
  }
  return answered ? 'online' : 'offline';
}

export interface InboxThreadRow {
  threadId: string;
  title: string | null;
  isDefault: boolean;
  preview: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface InboxAgentRow {
  slug: string;
  name: string;
  description: string | null;
  /** Default thread (or the most recent one); null until one is opened. */
  threadId: string | null;
  /** All threads with this agent, most recent first (P4b). */
  threads: InboxThreadRow[];
  preview: string | null;
  lastMessageAt: string | null;
  unread: number;
  /** False when the peer no longer exposes the agent (or is offline and it is only known from history). */
  available: boolean;
}

export interface InboxUnitGroup {
  peerId: string;
  name: string;
  displayName: string;
  emoji: string | null;
  role: string | null;
  /** Heartbeat state when fresh (P4d), else whether the agents list answered. */
  status: 'online' | 'degraded' | 'offline';
  agents: InboxAgentRow[];
}

export interface InboxArchivedGroup {
  peerId: string;
  name: string;
  displayName: string;
  threads: Array<{ threadId: string; agentSlug: string; title: string | null; lastMessageAt: string | null; preview: string | null }>;
}

export interface InboxListing {
  home: { name: string; displayName: string; emoji: string | null; role: string | null; agents: Array<{ slug: string; name: string }> };
  units: InboxUnitGroup[];
  archived: InboxArchivedGroup[];
}

export interface InboxMessageView {
  id: string;
  role: FederatedMessage['role'];
  content: string;
  status: FederatedMessage['status'];
  truncated: boolean;
  errorCode: string | null;
  createdAt: string;
}

export interface InboxThreadView {
  thread: { id: string; agentSlug: string; title: string | null };
  unit: { peerId: string; name: string; displayName: string };
  readOnly: boolean;
  messages: InboxMessageView[];
  /** Cursor for older messages (`before`), null when the start is loaded. */
  nextCursor: string | null;
}

export interface InboxMessagePage {
  messages: InboxMessageView[];
  nextCursor: string | null;
}

export interface InboxUpdates {
  totalUnread: number;
  threads: Array<{ threadId: string; unread: number; pending: boolean; lastMessageAt: string | null; preview: string | null }>;
  serverTime: string;
}

export interface InboxSendResult {
  userMessage: InboxMessageView;
  agentMessage: InboxMessageView | null;
  /** System notes added during the send, e.g. "Context reset on <unit>". */
  notices: InboxMessageView[];
}

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);
const time = (value: Date | null) => (value ? new Date(value).getTime() : 0);

function cleanTitle(title: unknown): string {
  if (typeof title !== 'string') throw new InboxError('validation_error', 'Title is required', 400);
  const text = title.replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_THREAD_TITLE_CHARS) {
    throw new InboxError('validation_error', `Title is required (max ${MAX_THREAD_TITLE_CHARS} characters)`, 400);
  }
  return text;
}

export function toMessageView(message: FederatedMessage): InboxMessageView {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    truncated: message.truncated,
    errorCode: message.errorCode,
    createdAt: new Date(message.createdAt).toISOString(),
  };
}

/**
 * Packs the last turns into the question for the stateless ask endpoint.
 * Oldest context is dropped first so the result fits MAX_QUESTION_CHARS.
 */
export function packQuestion(history: FederatedMessage[], content: string, maxChars = MAX_QUESTION_CHARS): string {
  const current = content.slice(0, maxChars);
  const turns = history
    .filter(message => message.status === 'done' && (message.role === 'user' || message.role === 'agent'))
    .slice(-CONTEXT_TURNS)
    .map(message => `${message.role === 'user' ? 'User' : 'Agent'}: ${message.content.slice(0, CONTEXT_ITEM_CHARS)}`);
  const header = 'Earlier messages in this conversation (oldest first, background only):';
  const footer = 'Current message:';
  while (turns.length > 0) {
    const packed = `${header}\n${turns.join('\n')}\n\n${footer}\n${current}`;
    if (packed.length <= maxChars) return packed;
    turns.shift();
  }
  return current;
}

export class InboxService {
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly random: () => number;
  private readonly polling = new Set<string>();
  private readonly localPollFailures = new Map<string, number>();
  private readonly agentCache = new Map<string, { at: number; value: { agents: PeerAgent[]; unit: PeerUnitProfile | null; askVersion?: number } }>();
  private readonly inFlight = new Set<string>();
  private readonly peerSends = new Map<string, number[]>();

  constructor(private readonly deps: InboxServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? (line => console.info(line));
    this.random = deps.random ?? Math.random;
  }

  private async peerAgents(peer: PeerRecord, user: InboxUser) {
    const key = `${user.id}:${peer.id}`;
    const cached = this.agentCache.get(key);
    if (cached && this.now() - cached.at < AGENT_LIST_CACHE_MS) return cached.value;
    const value = await this.deps.federation.listAgentsWithUnit(peer.id, { initiatedByUserId: user.id });
    this.agentCache.set(key, { at: this.now(), value });
    return value;
  }

  async list(user: InboxUser): Promise<InboxListing> {
    const [home, peers, threads, beats] = await Promise.all([
      this.deps.loadHomeUnit(),
      this.deps.peers.list(),
      this.deps.store.listThreads(user.id),
      this.deps.beatStates ? this.deps.beatStates().catch(() => null) : Promise.resolve(null),
    ]);

    const active = peers.filter(peer => peer.status === 'active');
    const results = await Promise.all(active.map(peer => this.peerAgents(peer, user).catch(() => null)));

    const units: InboxUnitGroup[] = active.map((peer, index) => {
      const result = results[index];
      const peerThreads = threads.filter(thread => thread.peerId === peer.id);
      const rows = new Map<string, InboxAgentRow>();
      for (const agent of result?.agents ?? []) {
        rows.set(agent.id, {
          slug: agent.id, name: agent.name, description: agent.description ?? null,
          threadId: null, threads: [], preview: null, lastMessageAt: null, unread: 0, available: true,
        });
      }
      const recentFirst = [...peerThreads].sort((a, b) => time(b.lastMessageAt ?? b.createdAt) - time(a.lastMessageAt ?? a.createdAt));
      for (const thread of recentFirst) {
        const row = rows.get(thread.agentSlug) ?? {
          slug: thread.agentSlug, name: thread.agentSlug, description: null,
          threadId: null, threads: [], preview: null, lastMessageAt: null, unread: 0, available: false,
        };
        const preview = thread.preview?.slice(0, PREVIEW_CHARS) ?? null;
        const first = row.threads.length === 0;
        rows.set(thread.agentSlug, {
          ...row,
          threadId: thread.isDefault || !row.threadId ? thread.id : row.threadId,
          threads: [...row.threads, {
            threadId: thread.id, title: thread.title, isDefault: thread.isDefault, preview,
            lastMessageAt: iso(thread.lastMessageAt), unread: thread.unread,
          }],
          preview: first ? preview : row.preview,
          lastMessageAt: first ? iso(thread.lastMessageAt) : row.lastMessageAt,
          unread: row.unread + thread.unread,
        });
      }
      return {
        peerId: peer.id,
        name: peer.unitName,
        displayName: result?.unit?.displayName ?? peer.displayName ?? peer.unitName,
        emoji: result?.unit?.emoji ?? null,
        role: result?.unit?.role ?? null,
        status: unitStatus(result !== null, beats?.get(peer.id) ?? null, this.now()),
        agents: [...rows.values()],
      };
    });

    const archived: InboxArchivedGroup[] = peers
      .filter(peer => peer.status !== 'active')
      .map(peer => ({
        peerId: peer.id,
        name: peer.unitName,
        displayName: peer.displayName ?? peer.unitName,
        threads: threads.filter(thread => thread.peerId === peer.id).map(thread => ({
          threadId: thread.id, agentSlug: thread.agentSlug, title: thread.title, lastMessageAt: iso(thread.lastMessageAt),
          preview: thread.preview?.slice(0, PREVIEW_CHARS) ?? null,
        })),
      }))
      .filter(group => group.threads.length > 0);

    return {
      // Local domains are not agents: the Agents section lists remote agents only.
      home: { name: home.name, displayName: home.displayName, emoji: home.emoji, role: home.role, agents: [] },
      units,
      archived,
    };
  }

  async openThread(
    user: InboxUser,
    peerId: string,
    agentSlug: string,
    options: { newThread?: boolean; title?: string | null } = {},
  ): Promise<FederatedThread> {
    const slug = agentSlug.trim().toLowerCase();
    if (!AGENT_SLUG.test(slug)) throw new InboxError('validation_error', 'Invalid agent', 400);
    const peer = await this.activePeer(peerId);
    const { agents } = await this.peerAgents(peer, user).catch(() => {
      throw new InboxError('peer_unreachable', 'Unit could not be reached', 502);
    });
    const agent = agents.find(item => item.id === slug);
    if (!agent) throw new InboxError('not_found', 'Agent not found on this unit', 404);
    const base = `${agent.name} @ ${peer.displayName ?? peer.unitName}`.slice(0, MAX_THREAD_TITLE_CHARS);
    const params = { userId: user.id, peerId: peer.id, agentSlug: slug };
    if (!options.newThread) return this.deps.store.findOrCreateThread({ ...params, title: base });
    const title = options.title ? cleanTitle(options.title) : `${agent.name} · ${new Date(this.now()).toISOString().slice(0, 16).replace('T', ' ')}`;
    return this.deps.store.createThread({ ...params, title: title.slice(0, MAX_THREAD_TITLE_CHARS) });
  }

  async getThread(user: InboxUser, threadId: string): Promise<InboxThreadView> {
    const { thread, peer } = await this.loadThread(user, threadId);
    await this.pollDue(user, POLLS_PER_REQUEST, thread.id)
      .catch(error => this.log(`[Inbox] poll failed: ${error instanceof Error ? error.message : 'error'}`));
    const page = await this.page(thread.id, null, THREAD_PAGE_SIZE);
    await this.deps.store.markRead(thread.id, new Date(this.now()));
    return {
      thread: { id: thread.id, agentSlug: thread.agentSlug, title: thread.title },
      unit: { peerId: thread.peerId, name: peer?.unitName ?? 'unknown', displayName: peer?.displayName ?? peer?.unitName ?? 'unknown' },
      readOnly: peer?.status !== 'active',
      ...page,
    };
  }

  /** Older messages for "Load older" (keyset on the oldest loaded message id). */
  async listMessages(user: InboxUser, threadId: string, before: string | null, limit = THREAD_PAGE_SIZE): Promise<InboxMessagePage> {
    const { thread } = await this.loadThread(user, threadId);
    if (before !== null && !UUID.test(before)) throw new InboxError('validation_error', 'Invalid cursor', 400);
    const size = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : THREAD_PAGE_SIZE;
    return this.page(thread.id, before, size);
  }

  async renameThread(user: InboxUser, threadId: string, title: unknown): Promise<{ id: string; title: string }> {
    const { thread } = await this.loadWritableThread(user, threadId);
    const text = cleanTitle(title);
    await this.deps.store.renameThread(thread.id, text);
    return { id: thread.id, title: text };
  }

  /** Deletes one thread's local history; only for units that are no longer paired (decision 2). Home only (decision 3). */
  async deleteThread(user: InboxUser, threadId: string): Promise<void> {
    const { thread, peer } = await this.loadThread(user, threadId);
    if (peer?.status === 'active') {
      throw new InboxError('invalid_state', 'Threads can only be deleted for units that are no longer paired', 409);
    }
    await this.deps.store.deleteThread(user.id, thread.id);
  }

  private async page(threadId: string, before: string | null, limit: number): Promise<InboxMessagePage> {
    // Fetch one extra row to know whether older messages exist.
    const rows = await this.deps.store.listMessagesBefore(threadId, before, limit + 1);
    const hasMore = rows.length > limit;
    const messages = hasMore ? rows.slice(rows.length - limit) : rows;
    return { messages: messages.map(toMessageView), nextCursor: hasMore ? messages[0]?.id ?? null : null };
  }

  async send(user: InboxUser, threadId: string, content: string): Promise<InboxSendResult> {
    const text = content.trim();
    if (!text || text.length > MAX_QUESTION_CHARS) {
      throw new InboxError('validation_error', `Message is required (max ${MAX_QUESTION_CHARS} characters)`, 400);
    }
    const { thread, peer } = await this.loadWritableThread(user, threadId);
    return this.dispatch(user, thread, peer, async () => this.deps.store.insertMessage({
      threadId: thread.id, role: 'user', content: text, status: 'pending',
    }));
  }

  async retry(user: InboxUser, threadId: string, messageId: string) {
    const { thread, peer } = await this.loadWritableThread(user, threadId);
    const message = await this.deps.store.getMessage(thread.id, messageId);
    if (!message || message.role !== 'user') throw new InboxError('not_found', 'Message not found', 404);
    if (message.status !== 'failed' && message.status !== 'timeout') {
      throw new InboxError('invalid_state', 'Only failed or timed-out messages can be retried', 409);
    }
    return this.dispatch(user, thread, peer, async () => {
      await this.deps.store.updateMessage(message.id, { status: 'pending', errorCode: null });
      return { ...message, status: 'pending', errorCode: null };
    });
  }

  /** Manual "delete history" for a Unit that is no longer paired (decision 2). */
  async deleteArchivedHistory(user: InboxUser, peerId: string): Promise<number> {
    const peer = await this.deps.peers.get(peerId);
    if (peer?.status === 'active') {
      throw new InboxError('invalid_state', 'History can only be deleted for units that are no longer paired', 409);
    }
    return this.deps.store.deleteThreadsForPeer(user.id, peerId);
  }

  private async activePeer(peerId: string): Promise<PeerRecord> {
    const peer = await this.deps.peers.get(peerId);
    if (!peer) throw new InboxError('not_found', 'Unit not found', 404);
    if (peer.status !== 'active') throw new InboxError('unit_not_paired', 'Unit no longer paired', 409);
    return peer;
  }

  private async loadThread(user: InboxUser, threadId: string) {
    const thread = await this.deps.store.getThread(user.id, threadId);
    if (!thread) throw new InboxError('not_found', 'Thread not found', 404);
    const peer = await this.deps.peers.get(thread.peerId);
    return { thread, peer };
  }

  private async loadWritableThread(user: InboxUser, threadId: string) {
    const { thread, peer } = await this.loadThread(user, threadId);
    if (!peer || peer.status !== 'active') throw new InboxError('unit_not_paired', 'Unit no longer paired', 409);
    return { thread, peer };
  }

  private acquirePeerSlot(peerId: string): boolean {
    const cutoff = this.now() - 60_000;
    const recent = (this.peerSends.get(peerId) ?? []).filter(at => at > cutoff);
    if (recent.length >= PEER_SENDS_PER_MINUTE) {
      this.peerSends.set(peerId, recent);
      return false;
    }
    recent.push(this.now());
    this.peerSends.set(peerId, recent);
    return true;
  }

  private async dispatch(
    user: InboxUser,
    thread: FederatedThread,
    peer: PeerRecord,
    createPending: () => Promise<FederatedMessage>,
  ): Promise<InboxSendResult> {
    if (this.inFlight.has(thread.id)) throw new InboxError('send_in_progress', 'A message is already being sent in this thread', 409);
    this.inFlight.add(thread.id);
    const started = this.now();
    try {
      // P4c: an async reply still pending also counts as in flight (one per thread).
      if (await this.deps.store.hasPendingAsync(thread.id)) {
        throw new InboxError('send_in_progress', 'A message is already being sent in this thread', 409);
      }
      if (!this.acquirePeerSlot(peer.id)) throw new InboxError('rate_limited', 'Too many messages to this unit, try again in a minute', 429);
      const pending = await createPending();
      const history = (await this.deps.store.listMessages(thread.id, 50))
        .filter(message => message.id !== pending.id && new Date(message.createdAt) <= new Date(pending.createdAt));

      await this.deps.store.touchThread(thread.id, new Date(this.now()));
      const notices: FederatedMessage[] = [];
      // The key is stable per (message, remote conversation) so a retry replays, while a
      // context reset (new conversation, different body) gets its own key.
      const useAsync = await this.supportsAsync(peer, user);
      const ask = async (conversationId: string | null): Promise<{ outcome: AsyncAskOutcome; key: string }> => {
        const input = {
          // With a handle the peer already has the context; send only the new message.
          question: conversationId ? pending.content : packQuestion(history, pending.content),
          conversationId, threadTitle: thread.title, idempotencyKey: `${pending.id}:${conversationId ?? 'new'}`,
        };
        const ctx = { initiatedByUserId: user.id, threadId: thread.id };
        if (useAsync) return { outcome: await this.deps.federation.askAgentAsync!(peer.id, thread.agentSlug, input, ctx), key: input.idempotencyKey };
        const result = await this.deps.federation.askAgentInConversation(peer.id, thread.agentSlug, input, ctx);
        return { outcome: { status: 'done', result }, key: input.idempotencyKey };
      };
      try {
        let asked;
        try {
          asked = await ask(thread.remoteConversationId);
        } catch (error) {
          if (!(thread.remoteConversationId && error instanceof FederationError && error.code === 'peer_conversation_not_found')) throw error;
          // The peer lost (or no longer accepts) the conversation: start over once, with packed context.
          await this.deps.store.setRemoteConversationId(thread.id, null);
          notices.push(await this.deps.store.insertMessage({
            threadId: thread.id, role: 'system', content: `Context reset on ${peer.displayName ?? peer.unitName}`, status: 'done',
          }));
          asked = await ask(null);
        }
        const { outcome, key } = asked;
        if (outcome.status === 'pending') {
          // P4c: the peer runs it in the background; the poller picks the reply up.
          const at = this.now();
          await this.deps.store.schedulePoll(pending.id, {
            remoteRunId: key, nextPollAt: new Date(at + (outcome.pollAfterMs ?? pollDelay(0, this.random))),
            pollAttempts: 0, pendingDeadlineAt: new Date(at + PENDING_DEADLINE_MS),
          });
          this.logSend(thread, peer, 'pending', started);
          return { userMessage: toMessageView({ ...pending, status: 'pending', errorCode: null }), agentMessage: null, notices: notices.map(toMessageView) };
        }
        if (outcome.status === 'failed') {
          await this.deps.store.updateMessage(pending.id, { status: 'failed', errorCode: outcome.errorCode });
          this.logSend(thread, peer, 'failed', started, outcome.errorCode);
          return { userMessage: toMessageView({ ...pending, status: 'failed', errorCode: outcome.errorCode }), agentMessage: null, notices: notices.map(toMessageView) };
        }
        const agentMessage = await this.deliver(thread, pending, outcome.result, true);
        this.logSend(thread, peer, 'done', started);
        return {
          userMessage: toMessageView({ ...pending, status: 'done', errorCode: null }),
          agentMessage: toMessageView(agentMessage),
          notices: notices.map(toMessageView),
        };
      } catch (error) {
        const elapsed = this.now() - started;
        const code = error instanceof FederationError ? error.code : 'internal_error';
        const status = code === 'peer_unreachable' && elapsed >= ASK_TIMEOUT_MS - 1_000 ? 'timeout' : 'failed';
        const errorCode = status === 'timeout' ? 'timeout' : code;
        if (!(error instanceof FederationError)) {
          this.log(`[Inbox] send thread=${thread.id} agent=${thread.agentSlug} status=error error=${error instanceof Error ? error.message : 'internal_error'}`);
        }
        await this.deps.store.updateMessage(pending.id, { status, errorCode }).catch(updateError => {
          this.log(`[Inbox] send thread=${thread.id} agent=${thread.agentSlug} status=error error=${updateError instanceof Error ? updateError.message : 'internal_error'} (could not mark ${status})`);
        });
        this.logSend(thread, peer, status, started, errorCode);
        return { userMessage: toMessageView({ ...pending, status, errorCode }), agentMessage: null, notices: notices.map(toMessageView) };
      }
    } finally {
      this.inFlight.delete(thread.id);
    }
  }

  /** Async asks need peer ask protocol >= 2 and a client that supports them (mixed-version fallback). */
  private async supportsAsync(peer: PeerRecord, user: InboxUser): Promise<boolean> {
    if (!this.deps.federation.askAgentAsync || !this.deps.federation.getAskResult) return false;
    try {
      return ((await this.peerAgents(peer, user)).askVersion ?? 1) >= 2;
    } catch {
      return false;
    }
  }

  /** Stores a reply: user message done, agent message inserted, continuity handle saved. */
  private async deliver(thread: FederatedThread, pending: FederatedMessage, result: ConversationAskResult, markRead: boolean) {
    if (result.conversationId) {
      const current = await this.deps.store.getThreadById(thread.id);
      if (current && result.conversationId !== current.remoteConversationId) {
        await this.deps.store.setRemoteConversationId(thread.id, result.conversationId);
      }
    }
    await this.deps.store.updateMessage(pending.id, { status: 'done', errorCode: null });
    const agentMessage = await this.deps.store.insertMessage({
      threadId: thread.id, role: 'agent', content: result.answer, status: 'done', truncated: result.truncated,
      remoteMessageId: result.messageId,
    });
    const at = new Date(this.now());
    await this.deps.store.touchThread(thread.id, at);
    // Late replies (poller) stay unread until the thread is opened.
    if (markRead) await this.deps.store.markRead(thread.id, at);
    return agentMessage;
  }

  /**
   * Polls due pending async messages (P4c). `user` limits it to that user's
   * threads (client-driven); null polls everyone (background sweep).
   * Returns the number of messages resolved (done, failed or timed out).
   */
  async pollDue(user: InboxUser | null, limit = POLLS_PER_REQUEST, threadId?: string): Promise<number> {
    if (!this.deps.federation.getAskResult) return 0;
    const now = this.now();
    const due = await this.deps.store.listDuePending({ userId: user?.id ?? null, threadId: threadId ?? null, now: new Date(now), limit });
    let resolved = 0;
    for (const { message, thread } of due) {
      if (this.polling.has(message.id)) continue;
      // Cross-request guard: only the caller that moves next_poll_at forward polls.
      if (!await this.deps.store.claimPoll(message.id, message.nextPollAt, new Date(now + POLL_LEASE_MS))) continue;
      this.polling.add(message.id);
      try {
        if (await this.pollOne(message, thread)) resolved += 1;
      } finally {
        this.polling.delete(message.id);
      }
    }
    return resolved;
  }

  private async pollOne(message: FederatedMessage, thread: FederatedThread): Promise<boolean> {
    const now = this.now();
    const peer = await this.deps.peers.get(thread.peerId);
    const expired = !!message.pendingDeadlineAt && now >= new Date(message.pendingDeadlineAt).getTime();
    const finish = async (status: 'failed' | 'timeout', errorCode: string) => {
      await this.deps.store.updateMessage(message.id, { status, errorCode });
      this.log(`[Inbox] poll thread=${thread.id} agent=${thread.agentSlug} status=${status} error=${errorCode}`);
      return true;
    };
    if (!peer || peer.status !== 'active') return finish('failed', 'unit_not_paired');
    const tag = `[Inbox] poll thread=${thread.id} agent=${thread.agentSlug}`;
    try {
      let outcome: AsyncAskOutcome | null = null;
      try {
        outcome = await this.deps.federation.getAskResult!(peer.id, message.remoteRunId!, {
          initiatedByUserId: thread.userId, threadId: thread.id,
        });
      } catch (error) {
        if (!(error instanceof FederationError)) throw error;
        if (error.code === 'peer_ask_not_found') return await finish('failed', 'result_lost');
        // Denied or not paired any more: polling again will not help.
        if (!RETRYABLE_PEER_ERRORS.has(error.code)) return await finish('failed', error.code);
        // Unreachable or slow peer: not a failure, keep polling with backoff.
      }
      if (outcome?.status === 'done') {
        await this.deliver(thread, message, outcome.result, false);
        this.localPollFailures.delete(message.id);
        this.log(`${tag} status=done attempts=${message.pollAttempts + 1}`);
        return true;
      }
      if (outcome?.status === 'failed') {
        this.localPollFailures.delete(message.id);
        return await finish(outcome.errorCode === 'timeout' ? 'timeout' : 'failed', outcome.errorCode);
      }
      if (expired) return await finish('timeout', 'timeout');
    } catch (error) {
      // A local fault (store, mapping): never retry silently forever.
      const failures = (this.localPollFailures.get(message.id) ?? 0) + 1;
      this.log(`${tag} status=error error=${error instanceof Error ? error.message : 'internal_error'} failures=${failures}`);
      if (failures >= LOCAL_POLL_FAILURE_LIMIT) {
        this.localPollFailures.delete(message.id);
        return finish('failed', 'internal_error').catch(finishError => {
          this.log(`${tag} status=error error=${finishError instanceof Error ? finishError.message : 'internal_error'} (could not mark failed)`);
          return false;
        });
      }
      this.localPollFailures.set(message.id, failures);
    }
    const attempts = message.pollAttempts + 1;
    await this.deps.store.schedulePoll(message.id, {
      remoteRunId: message.remoteRunId!, nextPollAt: new Date(now + pollDelay(attempts, this.random)),
      pollAttempts: attempts, pendingDeadlineAt: message.pendingDeadlineAt,
    });
    return false;
  }

  /** Unread and pending state for the sidebar (P4c); also polls this user's due messages. */
  async updates(user: InboxUser): Promise<InboxUpdates> {
    await this.pollDue(user, POLLS_PER_REQUEST).catch(error => this.log(`[Inbox] poll failed: ${error instanceof Error ? error.message : 'error'}`));
    const threads = await this.deps.store.listThreads(user.id);
    const views = threads.map(thread => ({
      threadId: thread.id, unread: thread.unread, pending: thread.pending ?? false,
      lastMessageAt: iso(thread.lastMessageAt), preview: thread.preview?.slice(0, PREVIEW_CHARS) ?? null,
    }));
    return { totalUnread: views.reduce((sum, view) => sum + view.unread, 0), threads: views, serverTime: new Date(this.now()).toISOString() };
  }

  /** Marks a thread read (e.g. when a late reply is shown in the open panel). */
  async markThreadRead(user: InboxUser, threadId: string): Promise<void> {
    const { thread } = await this.loadThread(user, threadId);
    await this.deps.store.markRead(thread.id, new Date(this.now()));
  }

  /** Metadata only; never message content. */
  private logSend(thread: FederatedThread, peer: PeerRecord, status: string, started: number, errorCode?: string) {
    this.log(`[Inbox] send thread=${thread.id} peer=${peer.unitName} agent=${thread.agentSlug} status=${status}`
      + `${errorCode ? ` error=${errorCode}` : ''} ms=${this.now() - started}`);
  }
}
