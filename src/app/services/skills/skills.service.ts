/**
 * Allerac Skills System - Service Layer
 * Manages skill lifecycle, assignment, activation, and analytics
 */

import pool from '@/app/clients/db';
import type { Message } from '@/app/types';

export interface Skill {
  id: string;
  user_id: string | null;
  name: string;
  display_name: string;
  description: string;
  content: string;
  category: string;
  learning_enabled: boolean;
  memory_scope: string;
  rag_integration: boolean;
  auto_switch_rules: AutoSwitchRules | null;
  version: string;
  license: string;
  verified: boolean;
  shared: boolean;
  install_count: number;
  avg_rating: number | null;
  total_ratings: number;
  created_at: Date;
  updated_at: Date;
}

export interface AutoSwitchRules {
  keywords?: string[];
  file_types?: string[];
  time_pattern?: { hour: number };
  confidence_threshold?: number;
}

export interface SkillUsage {
  id: string;
  skill_id: string;
  user_id: string;
  bot_id: string | null;
  conversation_id: string;
  trigger_type: 'manual' | 'auto' | 'command';
  trigger_message: string | null;
  previous_skill_id: string | null;
  started_at: Date;
  completed_at: Date | null;
  tokens_used: number | null;
  tool_calls_count: number;
  success: boolean | null;
  error_message: string | null;
  user_rating: number | null;
  user_feedback: string | null;
}

export class SkillsService {
  /**
   * Get all skills available to a user (own + public shared skills)
   */
  async getAvailableSkills(userId: string): Promise<Skill[]> {
    const result = await pool.query<Skill>(
      `SELECT * FROM skills 
       WHERE user_id = $1 OR shared = true
       ORDER BY verified DESC, install_count DESC, category, name`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Get skills assigned to a specific Telegram bot
   */
  async getBotSkills(botId: string): Promise<Skill[]> {
    const result = await pool.query<Skill>(
      `SELECT s.*, tbs.is_default, tbs.order_index, tbs.enabled
       FROM skills s
       JOIN telegram_bot_skills tbs ON s.id = tbs.skill_id
       WHERE tbs.bot_id = $1 AND tbs.enabled = true
       ORDER BY tbs.order_index, s.name`,
      [botId]
    );
    return result.rows;
  }

  /**
   * Get skills assigned to a web user
   */
  async getUserSkills(userId: string): Promise<Skill[]> {
    const result = await pool.query<Skill>(
      `SELECT s.*, us.is_default, us.order_index, us.enabled
       FROM skills s
       JOIN user_skills us ON s.id = us.skill_id
       WHERE us.user_id = $1 AND us.enabled = true
       ORDER BY us.order_index, s.name`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Get a single skill by ID
   */
  async getSkillById(skillId: string): Promise<Skill | null> {
    const result = await pool.query<Skill>(
      'SELECT * FROM skills WHERE id = $1',
      [skillId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get a skill by name (case-insensitive)
   */
  async getSkillByName(name: string, userId?: string): Promise<Skill | null> {
    const query = userId
      ? 'SELECT * FROM skills WHERE LOWER(name) = LOWER($1) AND (user_id = $2 OR shared = true) LIMIT 1'
      : 'SELECT * FROM skills WHERE LOWER(name) = LOWER($1) AND shared = true LIMIT 1';
    
    const params = userId ? [name, userId] : [name];
    const result = await pool.query<Skill>(query, params);
    return result.rows[0] || null;
  }

  /**
   * Get currently active skill for a conversation
   */
  async getActiveSkill(conversationId: string): Promise<Skill | null> {
    const result = await pool.query<Skill>(
      `SELECT s.* FROM skills s
       JOIN conversation_active_skills cas ON s.id = cas.skill_id
       WHERE cas.conversation_id = $1`,
      [conversationId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get default skill for a bot
   */
  async getDefaultBotSkill(botId: string): Promise<Skill | null> {
    const result = await pool.query<Skill>(
      `SELECT s.* FROM skills s
       JOIN telegram_bot_skills tbs ON s.id = tbs.skill_id
       WHERE tbs.bot_id = $1 AND tbs.is_default = true AND tbs.enabled = true
       LIMIT 1`,
      [botId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get default skill for a web user
   */
  async getDefaultUserSkill(userId: string): Promise<Skill | null> {
    const result = await pool.query<Skill>(
      `SELECT s.* FROM skills s
       JOIN user_skills us ON s.id = us.skill_id
       WHERE us.user_id = $1 AND us.is_default = true AND us.enabled = true
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Activate a skill for a conversation
   */
  async activateSkill(
    skillId: string,
    conversationId: string,
    userId: string,
    triggerType: 'manual' | 'auto' | 'command',
    triggerMessage?: string,
    botId?: string
  ): Promise<void> {
    // Get previous skill
    const previousSkill = await this.getActiveSkill(conversationId);

    // Log skill usage start
    await pool.query(
      `INSERT INTO skill_usage (
        skill_id, conversation_id, user_id, bot_id, 
        trigger_type, trigger_message, previous_skill_id, started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        skillId,
        conversationId,
        userId,
        botId || null,
        triggerType,
        triggerMessage || null,
        previousSkill?.id || null,
      ]
    );

    // Update conversation's active skill
    await pool.query(
      `INSERT INTO conversation_active_skills (conversation_id, skill_id, previous_skill_id, activated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (conversation_id) 
       DO UPDATE SET 
         skill_id = $2,
         previous_skill_id = EXCLUDED.previous_skill_id,
         activated_at = NOW()`,
      [conversationId, skillId, previousSkill?.id || null]
    );
  }

  /**
   * Deactivate skill for a conversation
   */
  async deactivateSkill(conversationId: string): Promise<void> {
    await pool.query(
      'DELETE FROM conversation_active_skills WHERE conversation_id = $1',
      [conversationId]
    );
  }

  /**
   * Get skill content enriched with memories and RAG context
   */
  async getEnrichedSkillContent(
    skillId: string,
    userId: string,
    currentMessage?: string
  ): Promise<string> {
    const skill = await this.getSkillById(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    let enrichedContent = skill.content;

    // Add memory context if learning enabled
    if (skill.learning_enabled) {
      const memories = await this.getRelevantMemories(userId, skill.name);
      if (memories.length > 0) {
        const memoryContext = memories
          .map(m => `- ${m.summary} (${m.importance}, ${m.emotion})`)
          .join('\n');
        enrichedContent = `## 🧠 Learned Preferences\n\n${memoryContext}\n\n${enrichedContent}`;
      }
    }

    // Add RAG context if enabled and message provided
    if (skill.rag_integration && currentMessage) {
      const ragContext = await this.getRelevantDocuments(userId, currentMessage);
      if (ragContext.length > 0) {
        const docContext = ragContext
          .map(doc => `**${doc.filename}**:\n${doc.content}`)
          .join('\n\n---\n\n');
        enrichedContent = `## 📄 Relevant Documentation\n\n${docContext}\n\n${enrichedContent}`;
      }
    }

    return enrichedContent;
  }

  /**
   * Get relevant conversation memories for a skill
   */
  private async getRelevantMemories(
    userId: string,
    skillName: string
  ): Promise<Array<{ summary: string; importance: string; emotion: string }>> {
    const result = await pool.query(
      `SELECT summary, importance, emotion
       FROM conversation_summaries
       WHERE user_id = $1
         AND (summary ILIKE $2 OR summary ILIKE $3)
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId, `%${skillName}%`, '%skill%']
    );
    return result.rows;
  }

  /**
   * Get relevant RAG documents for context
   */
  private async getRelevantDocuments(
    userId: string,
    query: string,
    limit: number = 3
  ): Promise<Array<{ filename: string; content: string }>> {
    // Import services dynamically to avoid circular dependency
    const { VectorSearchService } = await import('../rag/vector-search.service');
    const { EmbeddingService } = await import('../rag/embedding.service');
    
    // Note: This requires a GitHub token. For now, we'll return empty if not available.
    // In production, consider passing token from context or using a service account.
    try {
      const embeddingService = new EmbeddingService(''); // Empty token - will fail gracefully
      const vectorSearch = new VectorSearchService(embeddingService);
      
      const context = await vectorSearch.getRelevantContext(query, userId, {
        limit: limit,
        similarityThreshold: 0.7,
      });
      
      // Parse context back to structured format
      if (!context || context.includes('No relevant documents')) {
        return [];
      }
      
      // Simple parsing - in real use, this will have proper structure
      return [{ filename: 'RAG Context', content: context }];
    } catch (error) {
      console.log('[SkillsService] RAG search not available:', error);
      return [];
    }
  }

  /**
   * Check if skill should auto-activate based on rules
   */
  async shouldAutoActivate(
    skill: Skill,
    context: {
      message: string;
      conversationHistory?: Message[];
    }
  ): Promise<boolean> {
    if (!skill.auto_switch_rules) return false;

    const rules = skill.auto_switch_rules;
    const message = context.message.toLowerCase();

    // Check keyword triggers
    if (rules.keywords) {
      const hasKeyword = rules.keywords.some(kw => message.includes(kw.toLowerCase()));
      if (hasKeyword) return true;
    }

    // Check file type triggers
    if (rules.file_types) {
      const hasFileType = rules.file_types.some(ft => message.includes(ft));
      if (hasFileType) return true;
    }

    // Check time-based patterns
    if (rules.time_pattern) {
      const currentHour = new Date().getHours();
      if (currentHour === rules.time_pattern.hour) return true;
    }

    return false;
  }

  /**
   * Complete skill usage tracking with performance metrics
   */
  async completeSkillUsage(
    conversationId: string,
    success: boolean,
    tokensUsed?: number,
    toolCalls?: number,
    errorMessage?: string
  ): Promise<void> {
    await pool.query(
      `UPDATE skill_usage
       SET completed_at = NOW(),
           success = $2,
           tokens_used = $3,
           tool_calls_count = $4,
           error_message = $5
       WHERE conversation_id = $1 
         AND completed_at IS NULL
       ORDER BY started_at DESC
       LIMIT 1`,
      [conversationId, success, tokensUsed || null, toolCalls || 0, errorMessage || null]
    );
  }

  /**
   * Record user rating for a skill
   */
  async rateSkill(
    skillId: string,
    conversationId: string,
    rating: number,
    feedback?: string
  ): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Update skill_usage record
    await pool.query(
      `UPDATE skill_usage
       SET user_rating = $3, user_feedback = $4
       WHERE skill_id = $1 AND conversation_id = $2
       ORDER BY started_at DESC
       LIMIT 1`,
      [skillId, conversationId, rating, feedback || null]
    );

    // Update skill's average rating
    await this.updateSkillRating(skillId);
  }

  /**
   * Recalculate skill's average rating
   */
  private async updateSkillRating(skillId: string): Promise<void> {
    await pool.query(
      `UPDATE skills
       SET avg_rating = (
         SELECT AVG(user_rating)::DECIMAL(3,2)
         FROM skill_usage
         WHERE skill_id = $1 AND user_rating IS NOT NULL
       ),
       total_ratings = (
         SELECT COUNT(*)
         FROM skill_usage
         WHERE skill_id = $1 AND user_rating IS NOT NULL
       )
       WHERE id = $1`,
      [skillId]
    );
  }

  /**
   * Get skill usage statistics
   */
  async getSkillStats(
    skillId: string,
    userId?: string
  ): Promise<{
    count: number;
    avgRating: number;
    successRate: number;
    avgTokens: number;
  }> {
    const query = userId
      ? 'SELECT * FROM skill_usage WHERE skill_id = $1 AND user_id = $2'
      : 'SELECT * FROM skill_usage WHERE skill_id = $1';
    
    const params = userId ? [skillId, userId] : [skillId];
    const result = await pool.query<SkillUsage>(query, params);

    const usages = result.rows;
    const count = usages.length;
    const avgRating = usages.filter(u => u.user_rating).reduce((sum, u) => sum + (u.user_rating || 0), 0) / count || 0;
    const successRate = usages.filter(u => u.success).length / count || 0;
    const avgTokens = usages.filter(u => u.tokens_used).reduce((sum, u) => sum + (u.tokens_used || 0), 0) / count || 0;

    return {
      count,
      avgRating: Math.round(avgRating * 10) / 10,
      successRate: Math.round(successRate * 100),
      avgTokens: Math.round(avgTokens),
    };
  }

  /**
   * Assign skill to Telegram bot
   */
  async assignSkillToBot(
    skillId: string,
    botId: string,
    isDefault: boolean = false
  ): Promise<void> {
    // If setting as default, clear other defaults first
    if (isDefault) {
      await pool.query(
        'UPDATE telegram_bot_skills SET is_default = false WHERE bot_id = $1',
        [botId]
      );
    }

    await pool.query(
      `INSERT INTO telegram_bot_skills (skill_id, bot_id, is_default)
       VALUES ($1, $2, $3)
       ON CONFLICT (bot_id, skill_id) 
       DO UPDATE SET is_default = $3, enabled = true`,
      [skillId, botId, isDefault]
    );

    // Increment install count
    await pool.query(
      'UPDATE skills SET install_count = install_count + 1 WHERE id = $1',
      [skillId]
    );
  }

  /**
   * Assign skill to web user
   */
  async assignSkillToUser(
    skillId: string,
    userId: string,
    isDefault: boolean = false
  ): Promise<void> {
    // If setting as default, clear other defaults first
    if (isDefault) {
      await pool.query(
        'UPDATE user_skills SET is_default = false WHERE user_id = $1',
        [userId]
      );
    }

    await pool.query(
      `INSERT INTO user_skills (skill_id, user_id, is_default)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, skill_id) 
       DO UPDATE SET is_default = $3, enabled = true`,
      [skillId, userId, isDefault]
    );

    // Increment install count
    await pool.query(
      'UPDATE skills SET install_count = install_count + 1 WHERE id = $1',
      [skillId]
    );
  }

  /**
   * Remove skill assignment from bot
   */
  async unassignSkillFromBot(skillId: string, botId: string): Promise<void> {
    await pool.query(
      'DELETE FROM telegram_bot_skills WHERE skill_id = $1 AND bot_id = $2',
      [skillId, botId]
    );
  }

  /**
   * Remove skill assignment from user
   */
  async unassignSkillFromUser(skillId: string, userId: string): Promise<void> {
    await pool.query(
      'DELETE FROM user_skills WHERE skill_id = $1 AND user_id = $2',
      [skillId, userId]
    );
  }

  /**
   * Create a new skill
   */
  async createSkill(skillData: Partial<Skill>): Promise<Skill> {
    const result = await pool.query<Skill>(
      `INSERT INTO skills (
        user_id, name, display_name, description, content, category,
        learning_enabled, memory_scope, rag_integration, auto_switch_rules,
        version, license, shared
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        skillData.user_id || null,
        skillData.name,
        skillData.display_name,
        skillData.description,
        skillData.content,
        skillData.category || 'workflow',
        skillData.learning_enabled || false,
        skillData.memory_scope || 'user',
        skillData.rag_integration || false,
        skillData.auto_switch_rules ? JSON.stringify(skillData.auto_switch_rules) : null,
        skillData.version || '1.0.0',
        skillData.license || 'MIT',
        skillData.shared || false,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update an existing skill
   */
  async updateSkill(skillId: string, skillData: Partial<Skill>): Promise<Skill> {
    const result = await pool.query<Skill>(
      `UPDATE skills SET
        display_name = COALESCE($2, display_name),
        description = COALESCE($3, description),
        content = COALESCE($4, content),
        category = COALESCE($5, category),
        learning_enabled = COALESCE($6, learning_enabled),
        memory_scope = COALESCE($7, memory_scope),
        rag_integration = COALESCE($8, rag_integration),
        auto_switch_rules = COALESCE($9, auto_switch_rules),
        version = COALESCE($10, version),
        shared = COALESCE($11, shared)
       WHERE id = $1
       RETURNING *`,
      [
        skillId,
        skillData.display_name,
        skillData.description,
        skillData.content,
        skillData.category,
        skillData.learning_enabled,
        skillData.memory_scope,
        skillData.rag_integration,
        skillData.auto_switch_rules ? JSON.stringify(skillData.auto_switch_rules) : null,
        skillData.version,
        skillData.shared,
      ]
    );
    return result.rows[0];
  }

  /**
   * Delete a skill
   */
  async deleteSkill(skillId: string, userId: string): Promise<void> {
    // Only allow deletion of own skills
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete all references first to avoid foreign key constraints
      // Clear previous_skill_id references in conversation_active_skills
      await client.query('UPDATE conversation_active_skills SET previous_skill_id = NULL WHERE previous_skill_id = $1', [skillId]);
      
      // Clear previous_skill_id references in skill_usage
      await client.query('UPDATE skill_usage SET previous_skill_id = NULL WHERE previous_skill_id = $1', [skillId]);
      
      // Delete active skills
      await client.query('DELETE FROM conversation_active_skills WHERE skill_id = $1', [skillId]);
      
      // Delete bot assignments
      await client.query('DELETE FROM telegram_bot_skills WHERE skill_id = $1', [skillId]);
      
      // Delete user assignments
      await client.query('DELETE FROM user_skills WHERE skill_id = $1', [skillId]);
      
      // Delete usage stats
      await client.query('DELETE FROM skill_usage WHERE skill_id = $1', [skillId]);
      
      // Now delete the skill itself (only if owned by user)
      await client.query(
        'DELETE FROM skills WHERE id = $1 AND user_id = $2',
        [skillId, userId]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const skillsService = new SkillsService();
