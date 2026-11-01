import pool from '@/app/clients/db';
import type { ToolConversationStore } from './tool-conversations';

/** SQL store for federated_tool_conversations (mig 148). */
export class ToolConversationRepository implements ToolConversationStore {
  async get(localConversationId: string, peerId: string, agentSlug: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT remote_conversation_id FROM federated_tool_conversations
        WHERE local_conversation_id = $1 AND peer_id = $2 AND agent_slug = $3`,
      [localConversationId, peerId, agentSlug],
    );
    return (result.rows[0]?.remote_conversation_id as string | undefined) ?? null;
  }

  async set(localConversationId: string, peerId: string, agentSlug: string, remoteConversationId: string): Promise<void> {
    await pool.query(
      `INSERT INTO federated_tool_conversations (local_conversation_id, peer_id, agent_slug, remote_conversation_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (local_conversation_id, peer_id, agent_slug)
       DO UPDATE SET remote_conversation_id = EXCLUDED.remote_conversation_id, updated_at = NOW()`,
      [localConversationId, peerId, agentSlug, remoteConversationId],
    );
  }

  async clear(localConversationId: string, peerId: string, agentSlug: string): Promise<void> {
    await pool.query(
      'DELETE FROM federated_tool_conversations WHERE local_conversation_id = $1 AND peer_id = $2 AND agent_slug = $3',
      [localConversationId, peerId, agentSlug],
    );
  }
}

export const toolConversationRepository = new ToolConversationRepository();
