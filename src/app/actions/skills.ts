'use server';

import { SkillsService } from '../services/skills/skills.service';
import pool from '@/app/clients/db';
import { TelegramBotConfigService } from '../services/telegram/telegram-bot-config.service';
import { requireCurrentAdmin, requireCurrentUser } from '@/app/lib/auth-session';

const skillsService = new SkillsService();

export async function getAllSkills() {
  try {
    const user = await requireCurrentUser();
    return await skillsService.getAvailableSkills(user.id);
  } catch (error) {
    console.error('[Actions] Error getting skills:', error);
    throw error;
  }
}

export async function getSkillById(skillId: string) {
  try {
    const user = await requireCurrentUser();
    return await skillsService.getSkillForUser(skillId, user.id);
  } catch (error) {
    console.error('[Actions] Error getting skill:', error);
    throw error;
  }
}

export async function createSkill(data: {
  name: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  category?: string;
  tags?: string[];
  shared?: boolean;
}) {
  try {
    const user = await requireCurrentUser();
    return await skillsService.createSkill({
      user_id: user.id,
      name: data.name,
      display_name: data.displayName,
      description: data.description,
      content: data.systemPrompt, // 'content' is the field name in DB
      category: data.category || 'workflow',
      shared: data.shared || false,
      learning_enabled: false,
      memory_scope: 'user',
      rag_integration: false,
    });
  } catch (error) {
    console.error('[Actions] Error creating skill:', error);
    throw error;
  }
}

export async function updateSkill(skillId: string, data: {
  name?: string;
  displayName?: string;
  description?: string;
  systemPrompt?: string;
  category?: string;
  tags?: string[];
  shared?: boolean;
  enabled?: boolean;
}) {
  try {
    const user = await requireCurrentUser();
    return await skillsService.updateSkill(skillId, user.id, user.is_admin, {
      name: data.name,
      display_name: data.displayName,
      description: data.description,
      content: data.systemPrompt,
      category: data.category,
      shared: data.shared,
    });
  } catch (error) {
    console.error('[Actions] Error updating skill:', error);
    throw error;
  }
}

export async function deleteSkill(skillId: string) {
  try {
    const user = await requireCurrentUser();
    return await skillsService.deleteSkill(skillId, user.id);
  } catch (error) {
    console.error('[Actions] Error deleting skill:', error);
    throw error;
  }
}

export async function getSkillUsageStats(skillId: string) {
  try {
    const user = await requireCurrentUser();
    const skill = await skillsService.getSkillForUser(skillId, user.id);
    if (!skill) throw new Error('Skill not found');
    return await skillsService.getSkillStats(skillId, user.id);
  } catch (error) {
    console.error('[Actions] Error getting skill stats:', error);
    throw error;
  }
}

export async function getBotSkills(botId: string) {
  try {
    const user = await requireCurrentUser();
    const bot = await TelegramBotConfigService.getBotConfig(botId, user.id);
    if (!bot) throw new Error('Bot not found');
    return await skillsService.getBotSkills(botId);
  } catch (error) {
    console.error('[Actions] Error getting bot skills:', error);
    throw error;
  }
}

export async function assignSkillToBot(botId: string, skillId: string, isDefault: boolean = false) {
  try {
    const user = await requireCurrentUser();
    const [bot, skill] = await Promise.all([
      TelegramBotConfigService.getBotConfig(botId, user.id),
      skillsService.getSkillForUser(skillId, user.id),
    ]);
    if (!bot || !skill) throw new Error('Bot or skill not found');
    return await skillsService.assignSkillToBot(skillId, botId, isDefault);
  } catch (error) {
    console.error('[Actions] Error assigning skill to bot:', error);
    throw error;
  }
}

export async function removeSkillFromBot(botId: string, skillId: string) {
  try {
    const user = await requireCurrentUser();
    const bot = await TelegramBotConfigService.getBotConfig(botId, user.id);
    if (!bot) throw new Error('Bot not found');
    return await skillsService.unassignSkillFromBot(skillId, botId);
  } catch (error) {
    console.error('[Actions] Error removing skill from bot:', error);
    throw error;
  }
}

// Web chat actions
export async function getUserSkills() {
  try {
    const user = await requireCurrentUser();
    return await skillsService.getUserSkills(user.id);
  } catch (error) {
    console.error('[Actions] Error getting user skills:', error);
    throw error;
  }
}

export async function assignSkillToUser(skillId: string, isDefault: boolean = false) {
  try {
    const user = await requireCurrentUser();
    const skill = await skillsService.getSkillForUser(skillId, user.id);
    if (!skill) throw new Error('Skill not found');
    return await skillsService.assignSkillToUser(skillId, user.id, isDefault);
  } catch (error) {
    console.error('[Actions] Error assigning skill to user:', error);
    throw error;
  }
}

export async function activateSkill(
  skillId: string,
  conversationId: string
) {
  try {
    const user = await requireCurrentUser();
    const [conversation, skill] = await Promise.all([
      pool.query('SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2', [conversationId, user.id]),
      skillsService.getSkillForUser(skillId, user.id),
    ]);
    if (!conversation.rows[0] || !skill) throw new Error('Conversation or skill not found');
    return await skillsService.activateSkill(
      skillId,
      conversationId,
      user.id,
      'manual'
    );
  } catch (error) {
    console.error('[Actions] Error activating skill:', error);
    throw error;
  }
}

export async function deactivateSkill(conversationId: string) {
  try {
    const user = await requireCurrentUser();
    const conversation = await pool.query(
      'SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, user.id]
    );
    if (!conversation.rows[0]) throw new Error('Conversation not found');
    return await skillsService.deactivateSkill(conversationId);
  } catch (error) {
    console.error('[Actions] Error deactivating skill:', error);
    throw error;
  }
}

export async function getActiveSkill(conversationId: string) {
  try {
    const user = await requireCurrentUser();
    const conversation = await pool.query(
      'SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2',
      [conversationId, user.id]
    );
    if (!conversation.rows[0]) return null;
    return await skillsService.getActiveSkill(conversationId);
  } catch (error) {
    console.error('[Actions] Error getting active skill:', error);
    return null;
  }
}

// Telegram bot related
export async function getUserTelegramBot() {
  try {
    const user = await requireCurrentUser();
    const bots = await TelegramBotConfigService.getUserBotConfigs(user.id);
    // Return the first enabled bot
    return bots.find(bot => bot.enabled) || null;
  } catch (error) {
    console.error('[Actions] Error getting user telegram bot:', error);
    return null;
  }
}

// Skill → Tool assignments
export async function getSkillTools(skillId: string): Promise<string[]> {
  try {
    return await skillsService.getSkillTools(skillId);
  } catch (error) {
    console.error('[Actions] getSkillTools failed:', error);
    return [];
  }
}

export async function setSkillTools(skillId: string, toolNames: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireCurrentUser();
    const skill = await pool.query(
      'SELECT id FROM skills WHERE id = $1 AND (user_id = $2 OR $3 = true)',
      [skillId, user.id, user.is_admin]
    );
    if (!skill.rows[0]) return { success: false, error: 'Skill not found' };
    await pool.query('DELETE FROM skill_tools WHERE skill_id = $1', [skillId]);
    if (toolNames.length > 0) {
      await pool.query(
        `INSERT INTO skill_tools (skill_id, tool_name)
         SELECT $1, unnest($2::text[])
         ON CONFLICT DO NOTHING`,
        [skillId, toolNames]
      );
    }
    return { success: true };
  } catch (error) {
    console.error('[Actions] setSkillTools failed:', error);
    return { success: false, error: String(error) };
  }
}

// Domain → Skill default bindings
export async function getDomainSkillDefault(domainSlug: string): Promise<{ skill_id: string; skill_name: string; display_name: string } | null> {
  try {
    const res = await pool.query(
      `SELECT dsd.skill_id, s.name AS skill_name, s.display_name
       FROM domain_skill_defaults dsd
       JOIN skills s ON s.id = dsd.skill_id
       WHERE dsd.domain_slug = $1`,
      [domainSlug]
    );
    return res.rows[0] ?? null;
  } catch (error) {
    console.error('[Actions] getDomainSkillDefault failed:', error);
    return null;
  }
}

export async function getAllDomainSkillDefaults(): Promise<Array<{ domain_slug: string; skill_id: string | null; skill_name: string | null; display_name: string | null }>> {
  try {
    await requireCurrentAdmin();
    const res = await pool.query(
      `SELECT dsd.domain_slug, dsd.skill_id, s.name AS skill_name, s.display_name
       FROM domain_skill_defaults dsd
       LEFT JOIN skills s ON s.id = dsd.skill_id
       ORDER BY dsd.domain_slug`
    );
    return res.rows;
  } catch (error) {
    console.error('[Actions] getAllDomainSkillDefaults failed:', error);
    return [];
  }
}

export async function setDomainSkillDefault(domainSlug: string, skillId: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    await requireCurrentAdmin();
    await pool.query(
      `INSERT INTO domain_skill_defaults (domain_slug, skill_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (domain_slug) DO UPDATE SET skill_id = $2, updated_at = NOW()`,
      [domainSlug, skillId]
    );
    return { success: true };
  } catch (error) {
    console.error('[Actions] setDomainSkillDefault failed:', error);
    return { success: false, error: String(error) };
  }
}
