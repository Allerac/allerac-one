import pool from '@/app/clients/db';
import type {
  FederatedMessage, FederatedThread, FederatedThreadSummary, InboxStore, NewFederatedMessage,
} from './inbox.types';

type Row = Record<string, unknown>;

const PREVIEW_CHARS = 140;
const toDate = (value: unknown) => (value ? new Date(value as string) : null);

function mapThread(row: Row): FederatedThread {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    peerId: String(row.peer_id),
    agentSlug: String(row.agent_slug),
    title: (row.title as string | null) ?? null,
    remoteConversationId: (row.remote_conversation_id as string | null) ?? null,
    isDefault: Boolean(row.is_default),
    lastMessageAt: (row.last_message_at as Date | null) ?? null,
    lastReadAt: (row.last_read_at as Date | null) ?? null,
    archivedAt: (row.archived_at as Date | null) ?? null,
    topicResetPending: Boolean(row.topic_reset_pending),
    createdAt: row.created_at as Date,
  };
}

function mapMessage(row: Row): FederatedMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    role: row.role as FederatedMessage['role'],
    content: String(row.content),
    status: row.status as FederatedMessage['status'],
    truncated: Boolean(row.truncated),
    errorCode: (row.error_code as string | null) ?? null,
    remoteMessageId: (row.remote_message_id as string | null) ?? null,
    remoteRunId: (row.remote_run_id as string | null) ?? null,
    nextPollAt: (row.next_poll_at as Date | null) ?? null,
    pollAttempts: Number(row.poll_attempts ?? 0),
    pendingDeadlineAt: (row.pending_deadline_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  };
}

/** SQL store for federated_threads / federated_messages (mig 146/147). */
export class InboxRepository implements InboxStore {
  async listThreads(userId: string): Promise<FederatedThreadSummary[]> {
    const result = await pool.query(
      `SELECT t.*,
              LEFT(last_msg.content, ${PREVIEW_CHARS}) AS preview,
              -- Archived threads (phase 5) never count as unread.
              CASE WHEN t.archived_at IS NOT NULL THEN 0 ELSE
                (SELECT COUNT(*)::int FROM federated_messages m
                  WHERE m.thread_id = t.id AND m.role = 'agent'
                    AND m.created_at > COALESCE(t.last_read_at, '-infinity'::timestamptz)) END AS unread,
              EXISTS (SELECT 1 FROM federated_messages p
                WHERE p.thread_id = t.id AND p.status = 'pending' AND p.remote_run_id IS NOT NULL) AS pending
       FROM federated_threads t
       LEFT JOIN LATERAL (
         SELECT content FROM federated_messages m WHERE m.thread_id = t.id
         ORDER BY m.created_at DESC LIMIT 1
       ) last_msg ON true
       WHERE t.user_id = $1
       ORDER BY t.last_message_at DESC NULLS LAST`,
      [userId],
    );
    return result.rows.map(row => ({
      ...mapThread(row),
      preview: (row.preview as string | null) ?? null,
      unread: Number(row.unread ?? 0),
      pending: Boolean(row.pending),
    }));
  }

  async getThread(userId: string, threadId: string): Promise<FederatedThread | null> {
    const result = await pool.query(
      'SELECT * FROM federated_threads WHERE id = $1 AND user_id = $2',
      [threadId, userId],
    );
    return result.rows[0] ? mapThread(result.rows[0]) : null;
  }

  async findOrCreateThread(params: { userId: string; peerId: string; agentSlug: string; title: string }): Promise<FederatedThread> {
    const result = await pool.query(
      `INSERT INTO federated_threads (user_id, peer_id, agent_slug, title, is_default)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (user_id, peer_id, agent_slug) WHERE is_default DO UPDATE SET agent_slug = EXCLUDED.agent_slug
       RETURNING *`,
      [params.userId, params.peerId, params.agentSlug, params.title],
    );
    return mapThread(result.rows[0]);
  }

  async createThread(params: { userId: string; peerId: string; agentSlug: string; title: string }): Promise<FederatedThread> {
    const result = await pool.query(
      `INSERT INTO federated_threads (user_id, peer_id, agent_slug, title, is_default, last_message_at)
       VALUES ($1, $2, $3, $4, false, NOW()) RETURNING *`,
      [params.userId, params.peerId, params.agentSlug, params.title],
    );
    return mapThread(result.rows[0]);
  }

  async setRemoteConversationId(threadId: string, remoteConversationId: string | null): Promise<void> {
    await pool.query('UPDATE federated_threads SET remote_conversation_id = $2 WHERE id = $1', [threadId, remoteConversationId]);
  }

  async renameThread(threadId: string, title: string): Promise<void> {
    await pool.query('UPDATE federated_threads SET title = $2 WHERE id = $1', [threadId, title]);
  }

  async deleteThread(userId: string, threadId: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM federated_threads WHERE id = $1 AND user_id = $2', [threadId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listMessagesBefore(threadId: string, beforeId: string | null, limit: number): Promise<FederatedMessage[]> {
    // Keyset on (created_at, id) so pages stay stable while new messages arrive.
    const result = await pool.query(
      `SELECT * FROM (
         SELECT m.* FROM federated_messages m
         WHERE m.thread_id = $1
           AND ($2::uuid IS NULL OR (m.created_at, m.id) < (
             SELECT c.created_at, c.id FROM federated_messages c WHERE c.id = $2::uuid AND c.thread_id = $1))
         ORDER BY m.created_at DESC, m.id DESC LIMIT $3
       ) page ORDER BY created_at ASC, id ASC`,
      [threadId, beforeId, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows.map(mapMessage);
  }

  async listMessages(threadId: string, limit: number): Promise<FederatedMessage[]> {
    const result = await pool.query(
      `SELECT * FROM (
         SELECT * FROM federated_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT $2
       ) latest ORDER BY created_at ASC`,
      [threadId, Math.min(Math.max(limit, 1), 500)],
    );
    return result.rows.map(mapMessage);
  }

  async getMessage(threadId: string, messageId: string): Promise<FederatedMessage | null> {
    const result = await pool.query(
      'SELECT * FROM federated_messages WHERE id = $1 AND thread_id = $2',
      [messageId, threadId],
    );
    return result.rows[0] ? mapMessage(result.rows[0]) : null;
  }

  async insertMessage(message: NewFederatedMessage): Promise<FederatedMessage> {
    const result = await pool.query(
      `INSERT INTO federated_messages (thread_id, role, content, status, truncated, error_code, remote_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [message.threadId, message.role, message.content, message.status, message.truncated ?? false,
        message.errorCode ?? null, message.remoteMessageId ?? null],
    );
    return mapMessage(result.rows[0]);
  }

  async updateMessage(messageId: string, patch: { status: FederatedMessage['status']; errorCode?: string | null }): Promise<void> {
    // Leaving `pending` stops polling.
    await pool.query(
      // $2 must appear once: reusing it in the CASE made Postgres deduce two types and reject every update.
      `UPDATE federated_messages SET status = $2, error_code = $3,
              next_poll_at = CASE WHEN $4::boolean THEN next_poll_at ELSE NULL END
        WHERE id = $1`,
      [messageId, patch.status, patch.errorCode ?? null, patch.status === 'pending'],
    );
  }

  async touchThread(threadId: string, at: Date): Promise<void> {
    await pool.query('UPDATE federated_threads SET last_message_at = $2 WHERE id = $1', [threadId, at]);
  }

  async markRead(threadId: string, at: Date): Promise<void> {
    await pool.query('UPDATE federated_threads SET last_read_at = $2 WHERE id = $1', [threadId, at]);
  }

  async getThreadById(threadId: string): Promise<FederatedThread | null> {
    const result = await pool.query('SELECT * FROM federated_threads WHERE id = $1', [threadId]);
    return result.rows[0] ? mapThread(result.rows[0]) : null;
  }

  async schedulePoll(messageId: string, poll: { remoteRunId: string; nextPollAt: Date; pollAttempts: number; pendingDeadlineAt: Date | null }): Promise<void> {
    await pool.query(
      `UPDATE federated_messages
          SET remote_run_id = $2, next_poll_at = $3, poll_attempts = $4, pending_deadline_at = $5
        WHERE id = $1 AND status = 'pending'`,
      [messageId, poll.remoteRunId, poll.nextPollAt, poll.pollAttempts, poll.pendingDeadlineAt],
    );
  }

  async claimPoll(messageId: string, expected: Date | null, leaseUntil: Date): Promise<boolean> {
    const result = await pool.query(
      `UPDATE federated_messages SET next_poll_at = $3
        WHERE id = $1 AND status = 'pending' AND next_poll_at IS NOT DISTINCT FROM $2`,
      [messageId, expected, leaseUntil],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listDuePending(params: { userId: string | null; threadId: string | null; now: Date; limit: number }) {
    const result = await pool.query(
      `SELECT m.*, row_to_json(t.*) AS thread
         FROM federated_messages m
         JOIN federated_threads t ON t.id = m.thread_id
        WHERE m.status = 'pending' AND m.remote_run_id IS NOT NULL AND m.next_poll_at <= $1
          AND ($2::uuid IS NULL OR t.user_id = $2::uuid)
          AND ($3::uuid IS NULL OR t.id = $3::uuid)
        ORDER BY m.next_poll_at ASC
        LIMIT $4`,
      [params.now, params.userId, params.threadId, Math.min(Math.max(params.limit, 1), 200)],
    );
    return result.rows.map(row => {
      const thread = row.thread as Row;
      return {
        message: mapMessage(row),
        thread: mapThread({ ...thread, last_message_at: toDate(thread.last_message_at), last_read_at: toDate(thread.last_read_at),
          archived_at: toDate(thread.archived_at), created_at: toDate(thread.created_at) }),
      };
    });
  }

  async hasPendingAsync(threadId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM federated_messages WHERE thread_id = $1 AND status = 'pending' AND remote_run_id IS NOT NULL LIMIT 1`,
      [threadId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setTopicResetPending(threadId: string, pending: boolean): Promise<void> {
    await pool.query('UPDATE federated_threads SET topic_reset_pending = $2 WHERE id = $1', [threadId, pending]);
  }

  async archiveResolvedExtraThreads(userId: string): Promise<number> {
    // Same rule as migration 155, for threads that still had a pending async ask then.
    const result = await pool.query(
      `UPDATE federated_threads t SET archived_at = NOW()
        WHERE t.user_id = $1 AND NOT t.is_default AND t.archived_at IS NULL
          AND EXISTS (SELECT 1 FROM federated_threads d
                       WHERE d.user_id = t.user_id AND d.peer_id = t.peer_id AND d.agent_slug = t.agent_slug AND d.is_default)
          AND NOT EXISTS (SELECT 1 FROM federated_messages m
                           WHERE m.thread_id = t.id AND m.status = 'pending' AND m.remote_run_id IS NOT NULL)`,
      [userId],
    );
    return result.rowCount ?? 0;
  }

  async deleteThreadsForPeer(userId: string, peerId: string): Promise<number> {
    const result = await pool.query(
      'DELETE FROM federated_threads WHERE user_id = $1 AND peer_id = $2',
      [userId, peerId],
    );
    return result.rowCount ?? 0;
  }
}

export const inboxRepository = new InboxRepository();
