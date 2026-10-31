/** Unified inbox (federation P4a/P4b): home-side mirror of chats with remote agents. */

export type FederatedMessageRole = 'user' | 'agent' | 'system';
export type FederatedMessageStatus = 'pending' | 'done' | 'failed' | 'timeout';

export interface FederatedThread {
  id: string;
  userId: string;
  peerId: string;
  agentSlug: string;
  title: string | null;
  /** Peer-side conversation handle (P4b); null until the peer returns one. */
  remoteConversationId: string | null;
  /** The thread opened from the agent row; others come from "New thread". */
  isDefault: boolean;
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
  remoteMessageId: string | null;
  createdAt: Date;
}

export interface NewFederatedMessage {
  threadId: string;
  role: FederatedMessageRole;
  content: string;
  status: FederatedMessageStatus;
  truncated?: boolean;
  errorCode?: string | null;
  remoteMessageId?: string | null;
}

/** Persistence port; SQL in inbox.repository.ts, in memory in tests. */
export interface InboxStore {
  listThreads(userId: string): Promise<FederatedThreadSummary[]>;
  getThread(userId: string, threadId: string): Promise<FederatedThread | null>;
  /** The default thread for (user, peer, agent). */
  findOrCreateThread(params: { userId: string; peerId: string; agentSlug: string; title: string }): Promise<FederatedThread>;
  /** An additional, non-default thread (P4b). */
  createThread(params: { userId: string; peerId: string; agentSlug: string; title: string }): Promise<FederatedThread>;
  setRemoteConversationId(threadId: string, remoteConversationId: string | null): Promise<void>;
  renameThread(threadId: string, title: string): Promise<void>;
  deleteThread(userId: string, threadId: string): Promise<boolean>;
  /** Latest `limit` messages, oldest first. */
  listMessages(threadId: string, limit: number): Promise<FederatedMessage[]>;
  /** Up to `limit` messages strictly older than `beforeId` (or the latest when null), oldest first. */
  listMessagesBefore(threadId: string, beforeId: string | null, limit: number): Promise<FederatedMessage[]>;
  getMessage(threadId: string, messageId: string): Promise<FederatedMessage | null>;
  insertMessage(message: NewFederatedMessage): Promise<FederatedMessage>;
  updateMessage(messageId: string, patch: { status: FederatedMessageStatus; errorCode?: string | null }): Promise<void>;
  touchThread(threadId: string, at: Date): Promise<void>;
  markRead(threadId: string, at: Date): Promise<void>;
  deleteThreadsForPeer(userId: string, peerId: string): Promise<number>;
}
