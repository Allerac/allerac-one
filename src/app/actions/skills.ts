'use server';

import { SkillsService } from '../services/skills/skills.service';

const skillsService = new SkillsService();

export async function getAllSkills(userId: string | null) {
  try {
    return await skillsService.getAllSkills(userId);
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
    return await skillsService.createSkill(data);
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
    return await skillsService.updateSkill(skillId, data);
  } catch (error) {
    console.error('[Actions] Error updating skill:', error);
    throw error;
  }
}

export async function deleteSkill(skillId: string) {
  try {
    return await skillsService.deleteSkill(skillId);
  } catch (error) {
    console.error('[Actions] Error deleting skill:', error);
    throw error;
  }
}

export async function getSkillUsageStats(skillId: string) {
  try {
    return await skillsService.getSkillUsageStats(skillId);
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
    return await skillsService.assignSkillToBot(botId, skillId, isDefault);
  } catch (error) {
    console.error('[Actions] Error assigning skill to bot:', error);
    throw error;
  }
}

export async function removeSkillFromBot(botId: string, skillId: string) {
  try {
    return await skillsService.removeSkillFromBot(botId, skillId);
  } catch (error) {
    console.error('[Actions] Error removing skill from bot:', error);
    throw error;
  }
}
