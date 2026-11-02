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
  /** Phase 5: archived threads are read-only history; one active thread per (user, peer, agent). */
  archivedAt: Date | null;
  /** Phase 5: "New topic" was pressed; the next ask carries topic_reset (v3 peers). */
  topicResetPending?: boolean;
  createdAt: Date;
}

export interface FederatedThreadSummary extends FederatedThread {
  /** Last message content (clipped), for the sidebar preview. */
  preview: string | null;
  unread: number;
  /** P4c: an async reply is still pending in this thread. */
  pending?: boolean;
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
  /** P4c async asks: the peer Idempotency-Key used to fetch the result. */
  remoteRunId: string | null;
  nextPollAt: Date | null;
  pollAttempts: number;
  pendingDeadlineAt: Date | null;
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
  /** P4c: thread by id, without an owner check (internal use after the owner was verified). */
  getThreadById(threadId: string): Promise<FederatedThread | null>;
  /** P4c: (re)schedule polling for a pending async message. */
  schedulePoll(messageId: string, poll: { remoteRunId: string; nextPollAt: Date; pollAttempts: number; pendingDeadlineAt: Date | null }): Promise<void>;
  /** P4c: moves next_poll_at to `leaseUntil` only if it is still `expected`; false when someone else claimed it. */
  claimPoll(messageId: string, expected: Date | null, leaseUntil: Date): Promise<boolean>;
  /** P4c: due pending async messages, oldest due first. */
  listDuePending(params: { userId: string | null; threadId: string | null; now: Date; limit: number }): Promise<Array<{ message: FederatedMessage; thread: FederatedThread }>>;
  hasPendingAsync(threadId: string): Promise<boolean>;
  /** Phase 5: sets or clears the pending "New topic" flag. */
  setTopicResetPending(threadId: string, pending: boolean): Promise<void>;
  /**
   * Phase 5: archives this user's non-default threads that have no pending async
   * ask (the rule of migration 155, for threads that were pending then). Returns the count.
   */
  archiveResolvedExtraThreads(userId: string): Promise<number>;
}
