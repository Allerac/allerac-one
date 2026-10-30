/**
 * Unified inbox (federation P4a): one list of local agents plus each paired
 * Unit's exposed agents, and a 1:1 thread per remote agent.
 *
 * - Remote calls go through FederationClient only (keys never leave the server).
 * - Replies are synchronous (FederationClient ASK timeout, 60s). Async runs are P4c.
 * - The peer's ask endpoint is stateless, so the last few turns are packed into
 *   the question as background context (P4b adds remote continuity).
 * - Remote text is stored only in federated_* tables, never in chat_conversations,
 *   so local memory/RAG never sees it. It is untrusted and rendered as plain text.
 */
import { MAX_QUESTION_CHARS } from './agents.service';
import { FederationError } from './errors';
import { ASK_TIMEOUT_MS, type PeerAgent } from './federation-client';
import type { FederatedMessage, FederatedThread, InboxStore } from './inbox.types';
import type { PeerRecord, PeerStore } from './peer.types';
import type { PeerUnitProfile } from './unit-profile';

export const CONTEXT_TURNS = 6;
export const CONTEXT_ITEM_CHARS = 1_000;
export const AGENT_LIST_CACHE_MS = 30_000;
export const PEER_SENDS_PER_MINUTE = 10;
export const THREAD_PAGE_SIZE = 200;
const PREVIEW_CHARS = 140;
const AGENT_SLUG = /^[a-z0-9][a-z0-9_-]{0,99}$/;

export class InboxError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = 'InboxError';
  }
}

/** The subset of FederationClient the inbox needs. */
export interface InboxFederationPort {
  listAgentsWithUnit(peerId: string, ctx: { initiatedByUserId: string | null }): Promise<{ agents: PeerAgent[]; unit: PeerUnitProfile | null }>;
  askAgent(peerId: string, agent: string, question: string, ctx: { initiatedByUserId: string | null; threadId?: string | null }): Promise<{ answer: string; truncated: boolean }>;
}

export interface InboxUser {
  id: string;
  is_admin?: boolean;
}

export interface InboxServiceDeps {
  store: InboxStore;
  peers: PeerStore;
  federation: InboxFederationPort;
  localAgents(user: InboxUser): Promise<Array<{ slug: string; name: string }>>;
  loadHomeUnit(): Promise<PeerUnitProfile>;
  now?: () => number;
  log?: (line: string) => void;
}

export interface InboxAgentRow {
  slug: string;
  name: string;
  description: string | null;
  threadId: string | null;
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
  status: 'online' | 'offline';
  agents: InboxAgentRow[];
}

export interface InboxArchivedGroup {
  peerId: string;
  name: string;
  displayName: string;
  threads: Array<{ threadId: string; agentSlug: string; title: string | null; lastMessageAt: string | null }>;
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
}

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);

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
  private readonly agentCache = new Map<string, { at: number; value: { agents: PeerAgent[]; unit: PeerUnitProfile | null } }>();
  private readonly inFlight = new Set<string>();
  private readonly peerSends = new Map<string, number[]>();

  constructor(private readonly deps: InboxServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? (line => console.info(line));
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
    const [home, localAgents, peers, threads] = await Promise.all([
      this.deps.loadHomeUnit(),
      this.deps.localAgents(user),
      this.deps.peers.list(),
      this.deps.store.listThreads(user.id),
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
          threadId: null, preview: null, lastMessageAt: null, unread: 0, available: true,
        });
      }
      for (const thread of peerThreads) {
        const row = rows.get(thread.agentSlug) ?? {
          slug: thread.agentSlug, name: thread.agentSlug, description: null,
          threadId: null, preview: null, lastMessageAt: null, unread: 0, available: false,
        };
        rows.set(thread.agentSlug, {
          ...row,
          threadId: thread.id,
          preview: thread.preview?.slice(0, PREVIEW_CHARS) ?? null,
          lastMessageAt: iso(thread.lastMessageAt),
          unread: thread.unread,
        });
      }
      return {
        peerId: peer.id,
        name: peer.unitName,
        displayName: result?.unit?.displayName ?? peer.displayName ?? peer.unitName,
        emoji: result?.unit?.emoji ?? null,
        role: result?.unit?.role ?? null,
        status: result ? 'online' : 'offline',
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
        })),
      }))
      .filter(group => group.threads.length > 0);

    return {
      home: { name: home.name, displayName: home.displayName, emoji: home.emoji, role: home.role, agents: localAgents },
      units,
      archived,
    };
  }

  async openThread(user: InboxUser, peerId: string, agentSlug: string): Promise<FederatedThread> {
    const slug = agentSlug.trim().toLowerCase();
    if (!AGENT_SLUG.test(slug)) throw new InboxError('validation_error', 'Invalid agent', 400);
    const peer = await this.activePeer(peerId);
    const { agents } = await this.peerAgents(peer, user).catch(() => {
      throw new InboxError('peer_unreachable', 'Unit could not be reached', 502);
    });
    const agent = agents.find(item => item.id === slug);
    if (!agent) throw new InboxError('not_found', 'Agent not found on this unit', 404);
    return this.deps.store.findOrCreateThread({
      userId: user.id, peerId: peer.id, agentSlug: slug, title: `${agent.name} @ ${peer.displayName ?? peer.unitName}`.slice(0, 200),
    });
  }

  async getThread(user: InboxUser, threadId: string): Promise<InboxThreadView> {
    const { thread, peer } = await this.loadThread(user, threadId);
    const messages = await this.deps.store.listMessages(thread.id, THREAD_PAGE_SIZE);
    await this.deps.store.markRead(thread.id, new Date(this.now()));
    return {
      thread: { id: thread.id, agentSlug: thread.agentSlug, title: thread.title },
      unit: { peerId: thread.peerId, name: peer?.unitName ?? 'unknown', displayName: peer?.displayName ?? peer?.unitName ?? 'unknown' },
      readOnly: peer?.status !== 'active',
      messages: messages.map(toMessageView),
    };
  }

  async send(user: InboxUser, threadId: string, content: string): Promise<{ userMessage: InboxMessageView; agentMessage: InboxMessageView | null }> {
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
  ) {
    if (this.inFlight.has(thread.id)) throw new InboxError('send_in_progress', 'A message is already being sent in this thread', 409);
    if (!this.acquirePeerSlot(peer.id)) throw new InboxError('rate_limited', 'Too many messages to this unit, try again in a minute', 429);
    this.inFlight.add(thread.id);
    const started = this.now();
    try {
      const pending = await createPending();
      const history = (await this.deps.store.listMessages(thread.id, 50))
        .filter(message => message.id !== pending.id && new Date(message.createdAt) <= new Date(pending.createdAt));
      const question = packQuestion(history, pending.content);
      await this.deps.store.touchThread(thread.id, new Date(this.now()));
      try {
        const result = await this.deps.federation.askAgent(peer.id, thread.agentSlug, question, {
          initiatedByUserId: user.id, threadId: thread.id,
        });
        await this.deps.store.updateMessage(pending.id, { status: 'done', errorCode: null });
        const agentMessage = await this.deps.store.insertMessage({
          threadId: thread.id, role: 'agent', content: result.answer, status: 'done', truncated: result.truncated,
        });
        const at = new Date(this.now());
        await this.deps.store.touchThread(thread.id, at);
        await this.deps.store.markRead(thread.id, at);
        this.logSend(thread, peer, 'done', started);
        return { userMessage: toMessageView({ ...pending, status: 'done', errorCode: null }), agentMessage: toMessageView(agentMessage) };
      } catch (error) {
        const elapsed = this.now() - started;
        const code = error instanceof FederationError ? error.code : 'internal_error';
        const status = code === 'peer_unreachable' && elapsed >= ASK_TIMEOUT_MS - 1_000 ? 'timeout' : 'failed';
        const errorCode = status === 'timeout' ? 'timeout' : code;
        await this.deps.store.updateMessage(pending.id, { status, errorCode });
        this.logSend(thread, peer, status, started, errorCode);
        return { userMessage: toMessageView({ ...pending, status, errorCode }), agentMessage: null };
      }
    } finally {
      this.inFlight.delete(thread.id);
    }
  }

  /** Metadata only; never message content. */
  private logSend(thread: FederatedThread, peer: PeerRecord, status: string, started: number, errorCode?: string) {
    this.log(`[Inbox] send thread=${thread.id} peer=${peer.unitName} agent=${thread.agentSlug} status=${status}`
      + `${errorCode ? ` error=${errorCode}` : ''} ms=${this.now() - started}`);
  }
}
