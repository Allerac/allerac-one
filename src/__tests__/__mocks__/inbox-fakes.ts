// In-memory fakes for unified inbox tests (not a test file).
import type {
  FederatedMessage, FederatedThread, FederatedThreadSummary, InboxStore, NewFederatedMessage,
} from '@/federation/inbox.types';
import type { PeerRecord } from '@/federation/peer.types';

export class InMemoryInboxStore implements InboxStore {
  threads = new Map<string, FederatedThread>();
  messages: FederatedMessage[] = [];
  private seq = 0;
  private clock = 1_000;
  private tick() { this.clock += 1; return new Date(this.clock); }

  async listThreads(userId: string): Promise<FederatedThreadSummary[]> {
    return [...this.threads.values()].filter(t => t.userId === userId).map(t => {
      const own = this.messages.filter(m => m.threadId === t.id);
      return {
        ...t,
        preview: own.at(-1)?.content ?? null,
        unread: own.filter(m => m.role === 'agent' && (!t.lastReadAt || m.createdAt > t.lastReadAt)).length,
      };
    });
  }
  async getThread(userId: string, id: string) {
    const t = this.threads.get(id);
    return t && t.userId === userId ? { ...t } : null;
  }
  async findOrCreateThread(p: { userId: string; peerId: string; agentSlug: string; title: string }) {
    const existing = [...this.threads.values()].find(t => t.userId === p.userId && t.peerId === p.peerId && t.agentSlug === p.agentSlug);
    if (existing) return existing;
    const t: FederatedThread = {
      id: `thread-${++this.seq}`, userId: p.userId, peerId: p.peerId, agentSlug: p.agentSlug, title: p.title,
      lastMessageAt: null, lastReadAt: null, archivedAt: null, createdAt: this.tick(),
    };
    this.threads.set(t.id, t);
    return t;
  }
  async listMessages(threadId: string, limit: number) {
    return this.messages.filter(m => m.threadId === threadId).slice(-limit).map(m => ({ ...m }));
  }
  async getMessage(threadId: string, id: string) {
    const m = this.messages.find(x => x.id === id && x.threadId === threadId);
    return m ? { ...m } : null;
  }
  async insertMessage(m: NewFederatedMessage) {
    const row: FederatedMessage = {
      id: `msg-${++this.seq}`, threadId: m.threadId, role: m.role, content: m.content, status: m.status,
      truncated: m.truncated ?? false, errorCode: m.errorCode ?? null, createdAt: this.tick(),
    };
    this.messages.push(row);
    return { ...row };
  }
  async updateMessage(id: string, patch: { status: FederatedMessage['status']; errorCode?: string | null }) {
    const m = this.messages.find(x => x.id === id);
    if (m) { m.status = patch.status; m.errorCode = patch.errorCode ?? null; }
  }
  async touchThread(id: string, at: Date) { const t = this.threads.get(id); if (t) t.lastMessageAt = at; }
  async markRead(id: string) { const t = this.threads.get(id); if (t) t.lastReadAt = this.tick(); }
  async deleteThreadsForPeer(userId: string, peerId: string) {
    const ids = [...this.threads.values()].filter(t => t.userId === userId && t.peerId === peerId).map(t => t.id);
    ids.forEach(id => this.threads.delete(id));
    this.messages = this.messages.filter(m => !ids.includes(m.threadId));
    return ids.length;
  }
}

export function peerFixture(overrides: Partial<PeerRecord> = {}): PeerRecord {
  const now = new Date();
  return {
    id: '11111111-1111-4111-8111-111111111111', unitName: 'santos', displayName: 'Santos', origin: 'https://santos.example',
    protocolVersion: '1', initiatedByUs: true, status: 'active', inboundPrincipalId: null, inboundCapabilities: [],
    outboundCapabilities: ['federation.agents.list', 'federation.agents.ask'], outboundKeyEncrypted: 'enc:secret-key',
    outboundKeyPrefix: 'alr_live_x', nonceLocal: null, nonceRemote: null, pairingSecretHash: null,
    pairingSecretEncrypted: null, remoteRequestId: null, requestIp: null, expiresAt: null, createdBy: null,
    decidedBy: null, decidedAt: null, lastSeenAt: null, createdAt: now, updatedAt: now, ...overrides,
  };
}
