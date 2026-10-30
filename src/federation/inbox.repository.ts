import pool from '@/app/clients/db';
import type {
  FederatedMessage, FederatedThread, FederatedThreadSummary, InboxStore, NewFederatedMessage,
} from './inbox.types';

type Row = Record<string, unknown>;

const PREVIEW_CHARS = 140;

function mapThread(row: Row): FederatedThread {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    peerId: String(row.peer_id),
    agentSlug: String(row.agent_slug),
    title: (row.title as string | null) ?? null,
    lastMessageAt: (row.last_message_at as Date | null) ?? null,
    lastReadAt: (row.last_read_at as Date | null) ?? null,
    archivedAt: (row.archived_at as Date | null) ?? null,
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
    createdAt: row.created_at as Date,
  };
}

/** SQL store for federated_threads / federated_messages (mig 146). */
export class InboxRepository implements InboxStore {
  async listThreads(userId: string): Promise<FederatedThreadSummary[]> {
    const result = await pool.query(
      `SELECT t.*,
              LEFT(last_msg.content, ${PREVIEW_CHARS}) AS preview,
              (SELECT COUNT(*)::int FROM federated_messages m
                WHERE m.thread_id = t.id AND m.role = 'agent'
                  AND m.created_at > COALESCE(t.last_read_at, '-infinity'::timestamptz)) AS unread
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
      `INSERT INTO federated_threads (user_id, peer_id, agent_slug, title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, peer_id, agent_slug) DO UPDATE SET agent_slug = EXCLUDED.agent_slug
       RETURNING *`,
      [params.userId, params.peerId, params.agentSlug, params.title],
    );
    return mapThread(result.rows[0]);
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
      `INSERT INTO federated_messages (thread_id, role, content, status, truncated, error_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [message.threadId, message.role, message.content, message.status, message.truncated ?? false, message.errorCode ?? null],
    );
    return mapMessage(result.rows[0]);
  }

  async updateMessage(messageId: string, patch: { status: FederatedMessage['status']; errorCode?: string | null }): Promise<void> {
    await pool.query(
      'UPDATE federated_messages SET status = $2, error_code = $3 WHERE id = $1',
      [messageId, patch.status, patch.errorCode ?? null],
    );
  }

  async touchThread(threadId: string, at: Date): Promise<void> {
    await pool.query('UPDATE federated_threads SET last_message_at = $2 WHERE id = $1', [threadId, at]);
  }

  async markRead(threadId: string, at: Date): Promise<void> {
    await pool.query('UPDATE federated_threads SET last_read_at = $2 WHERE id = $1', [threadId, at]);
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
