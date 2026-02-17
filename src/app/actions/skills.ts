'use server';

import { SkillsService } from '../services/skills/skills.service';

const skillsService = new SkillsService();

export async function getAllSkills(userId: string | null) {
  try {
    if (!userId) {
      // Return only public shared skills if no user
      return await skillsService.getAvailableSkills('00000000-0000-0000-0000-000000000000');
    }
    return await skillsService.getAvailableSkills(userId);
  } catch (error) {
    console.error('[Actions] Error getting skills:', error);
    throw error;
  }
}

export async function getSkillById(skillId: string) {
  try {
    return await skillsService.getSkillById(skillId);
  } catch (error) {
    console.error('[Actions] Error getting skill:', error);
    throw error;
  }
}

export async function createSkill(data: {
  userId: string | null;
  name: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  category?: string;
  tags?: string[];
  shared?: boolean;
}) {
  try {
    return await skillsService.createSkill({
      user_id: data.userId,
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
    return await skillsService.updateSkill(skillId, {
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

export async function deleteSkill(skillId: string, userId: string) {
  try {
    return await skillsService.deleteSkill(skillId, userId);
  } catch (error) {
    console.error('[Actions] Error deleting skill:', error);
    throw error;
  }
}

export async function getSkillUsageStats(skillId: string) {
  try {
    return await skillsService.getSkillStats(skillId);
  } catch (error) {
    console.error('[Actions] Error getting skill stats:', error);
    throw error;
  }
}

export async function getBotSkills(botId: string) {
  try {
    return await skillsService.getBotSkills(botId);
  } catch (error) {
    console.error('[Actions] Error getting bot skills:', error);
    throw error;
  }
}

export async function assignSkillToBot(botId: string, skillId: string, isDefault: boolean = false) {
  try {
    return await skillsService.assignSkillToBot(skillId, botId, isDefault);
  } catch (error) {
    console.error('[Actions] Error assigning skill to bot:', error);
    throw error;
  }
}

export async function removeSkillFromBot(botId: string, skillId: string) {
  try {
    return await skillsService.unassignSkillFromBot(skillId, botId);
  } catch (error) {
    console.error('[Actions] Error removing skill from bot:', error);
    throw error;
  }
}

// Web chat actions
export async function getUserSkills(userId: string) {
  try {
    return await skillsService.getUserSkills(userId);
  } catch (error) {
    console.error('[Actions] Error getting user skills:', error);
    throw error;
  }
}

export async function assignSkillToUser(userId: string, skillId: string, isDefault: boolean = false) {
  try {
    return await skillsService.assignSkillToUser(skillId, userId, isDefault);
  } catch (error) {
    console.error('[Actions] Error assigning skill to user:', error);
    throw error;
  }
}

export async function activateSkill(
  skillId: string,
  conversationId: string,
  userId: string
) {
  try {
    return await skillsService.activateSkill(
      skillId,
      conversationId,
      userId,
      'manual'
    );
  } catch (error) {
    console.error('[Actions] Error activating skill:', error);
    throw error;
  }
}

export async function deactivateSkill(conversationId: string) {
  try {
    return await skillsService.deactivateSkill(conversationId);
  } catch (error) {
    console.error('[Actions] Error deactivating skill:', error);
    throw error;
  }
}

export async function getActiveSkill(conversationId: string) {
  try {
    return await skillsService.getActiveSkill(conversationId);
  } catch (error) {
    console.error('[Actions] Error getting active skill:', error);
    return null;
  }
}
