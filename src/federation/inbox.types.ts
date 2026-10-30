/** Unified inbox (federation P4a): home-side mirror of chats with remote agents. */

export type FederatedMessageRole = 'user' | 'agent' | 'system';
export type FederatedMessageStatus = 'pending' | 'done' | 'failed' | 'timeout';

export interface FederatedThread {
  id: string;
  userId: string;
  peerId: string;
  agentSlug: string;
  title: string | null;
  lastMessageAt: Date | null;
  lastReadAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface FederatedThreadSummary extends FederatedThread {
  /** Last message content (clipped), for the sidebar preview. */
  preview: string | null;
  unread: number;
}

export interface FederatedMessage {
  id: string;
  threadId: string;
  role: FederatedMessageRole;
  content: string;
  status: FederatedMessageStatus;
  truncated: boolean;
  errorCode: string | null;
  createdAt: Date;
}

export interface NewFederatedMessage {
  threadId: string;
  role: FederatedMessageRole;
  content: string;
  status: FederatedMessageStatus;
  truncated?: boolean;
  errorCode?: string | null;
}

/** Persistence port; SQL in inbox.repository.ts, in memory in tests. */
export interface InboxStore {
  listThreads(userId: string): Promise<FederatedThreadSummary[]>;
  getThread(userId: string, threadId: string): Promise<FederatedThread | null>;
  findOrCreateThread(params: { userId: string; peerId: string; agentSlug: string; title: string }): Promise<FederatedThread>;
  /** Latest `limit` messages, oldest first. */
  listMessages(threadId: string, limit: number): Promise<FederatedMessage[]>;
  getMessage(threadId: string, messageId: string): Promise<FederatedMessage | null>;
  insertMessage(message: NewFederatedMessage): Promise<FederatedMessage>;
  updateMessage(messageId: string, patch: { status: FederatedMessageStatus; errorCode?: string | null }): Promise<void>;
  touchThread(threadId: string, at: Date): Promise<void>;
  markRead(threadId: string, at: Date): Promise<void>;
  deleteThreadsForPeer(userId: string, peerId: string): Promise<number>;
}
