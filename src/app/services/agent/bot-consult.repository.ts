import pool from '@/app/clients/db';
import type { BotConsultStore, ConsultRecord } from './bot-consult';
import type { UnitAgent } from './unit-agents';

/** SQL store for bot_consults (mig 160) and the hand-off conversations (source = 'handoff'). */
export class BotConsultRepository implements BotConsultStore {
  async latestHandoff(userId: string, callerConversationId: string, targetSlug: string): Promise<string | null> {
    const result = await pool.query(
      `SELECT bc.handoff_conversation_id AS id
         FROM bot_consults bc
         JOIN chat_conversations cc ON cc.id = bc.handoff_conversation_id
        WHERE bc.user_id = $1 AND bc.caller_conversation_id = $2 AND bc.target_slug = $3
          AND cc.user_id = $1 AND cc.domain_slug = $3 AND cc.source = 'handoff'
        ORDER BY bc.created_at DESC
        LIMIT 1`,
      [userId, callerConversationId, targetSlug],
    );
    return (result.rows[0]?.id as string | undefined) ?? null;
  }

  async createHandoff(userId: string, bot: UnitAgent, title: string): Promise<string> {
    const result = await pool.query(
      `INSERT INTO chat_conversations (user_id, title, domain_slug, source)
       VALUES ($1, $2, $3, 'handoff') RETURNING id`,
      [userId, title.slice(0, 200), bot.slug],
    );
    const id = result.rows[0]?.id as string | undefined;
    if (!id) throw new Error('Failed to create hand-off conversation');
    return id;
  }

  async record(row: ConsultRecord): Promise<void> {
    await pool.query(
      `INSERT INTO bot_consults
         (user_id, caller_slug, caller_conversation_id, target_slug, handoff_conversation_id,
          question, status, error_code, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.userId, row.callerSlug, row.callerConversationId, row.targetSlug, row.handoffConversationId,
        row.question, row.status, row.errorCode, row.durationMs],
    );
  }
}

export const botConsultRepository = new BotConsultRepository();
