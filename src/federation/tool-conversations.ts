/**
 * ask_peer_agent continuity (federation P4c, mig 148).
 *
 * Each local chat conversation gets its own remote conversation per peer and
 * agent, so context from unrelated local chats never mixes on the peer (before
 * P4c every tool call went to one shared `Federation · <unit>` conversation).
 */
export interface ToolConversationStore {
  get(localConversationId: string, peerId: string, agentSlug: string): Promise<string | null>;
  set(localConversationId: string, peerId: string, agentSlug: string, remoteConversationId: string): Promise<void>;
  clear(localConversationId: string, peerId: string, agentSlug: string): Promise<void>;
}

export class InMemoryToolConversationStore implements ToolConversationStore {
  rows = new Map<string, string>();
  private key(a: string, b: string, c: string) { return `${a}|${b}|${c}`; }
  async get(a: string, b: string, c: string) { return this.rows.get(this.key(a, b, c)) ?? null; }
  async set(a: string, b: string, c: string, remote: string) { this.rows.set(this.key(a, b, c), remote); }
  async clear(a: string, b: string, c: string) { this.rows.delete(this.key(a, b, c)); }
}
