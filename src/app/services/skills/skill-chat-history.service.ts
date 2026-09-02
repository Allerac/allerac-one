/**
 * Persistence for the Domain Configuration "Skill Assistant" chat.
 * See migration 131_skill_chat_history.sql for the rationale.
 */

import pool from '@/app/clients/db';

export interface StoredChange {
  old: string;
  new: string;
  rationale: string;
}

export interface SkillChatMessage {
  id: string;
  skill_id: string;
  user_id: string;
  domain_slug: string;
  role: 'user' | 'assistant';
  content: string;
  changes: StoredChange[] | null;
  applied_changes: StoredChange[] | null;
  applied_at: Date | null;
  created_at: Date;
}

export interface AppliedImprovement extends SkillChatMessage {
  skill_name: string;
  skill_display_name: string;
}

export class SkillChatHistoryService {
  async logUserMessage(
    skillId: string, userId: string, domainSlug: string, content: string,
  ): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO skill_chat_messages (skill_id, user_id, domain_slug, role, content)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id`,
      [skillId, userId, domainSlug, content],
    );
    return result.rows[0].id;
  }

  async logAssistantReply(
    skillId: string, userId: string, domainSlug: string, content: string, changes: StoredChange[],
  ): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO skill_chat_messages (skill_id, user_id, domain_slug, role, content, changes)
       VALUES ($1, $2, $3, 'assistant', $4, $5)
       RETURNING id`,
      [skillId, userId, domainSlug, content, changes.length > 0 ? JSON.stringify(changes) : null],
    );
    return result.rows[0].id;
  }

  /** Marks an assistant turn's proposed changes as applied. Scoped to the owning user. */
  async recordAppliedChanges(
    messageId: string, userId: string, appliedChanges: StoredChange[],
  ): Promise<void> {
    await pool.query(
      `UPDATE skill_chat_messages
       SET applied_changes = $3, applied_at = NOW()
       WHERE id = $1 AND user_id = $2 AND role = 'assistant'`,
      [messageId, userId, JSON.stringify(appliedChanges)],
    );
  }

  async getHistory(skillId: string, userId: string): Promise<SkillChatMessage[]> {
    const result = await pool.query<SkillChatMessage>(
      `SELECT id, skill_id, user_id, domain_slug, role, content, changes, applied_changes, applied_at, created_at
       FROM skill_chat_messages
       WHERE skill_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [skillId, userId],
    );
    return result.rows;
  }

  /** Every applied change across all skills/domains, newest first — for spotting patterns to replicate. */
  async getAppliedImprovements(userId: string, limit = 50): Promise<AppliedImprovement[]> {
    const result = await pool.query<AppliedImprovement>(
      `SELECT m.id, m.skill_id, m.user_id, m.domain_slug, m.role, m.content,
              m.changes, m.applied_changes, m.applied_at, m.created_at,
              s.name AS skill_name, s.display_name AS skill_display_name
       FROM skill_chat_messages m
       JOIN skills s ON s.id = m.skill_id
       WHERE m.user_id = $1 AND m.applied_at IS NOT NULL
       ORDER BY m.applied_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows;
  }
}

export const skillChatHistoryService = new SkillChatHistoryService();
