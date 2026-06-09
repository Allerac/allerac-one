import pool from '@/app/clients/db';
import { Skill, skillsService } from '@/app/services/skills/skills.service';

export interface ResolveChatSkillInput {
  conversationId: string;
  userId: string;
  message: string;
  isNewConversation: boolean;
  preSelectedSkillId?: string;
  defaultSkillName?: string;
  emit: (event: object) => void;
}

export async function resolveActiveChatSkill(
  input: ResolveChatSkillInput,
): Promise<Skill | null> {
  let activeSkill = await skillsService.getActiveSkill(input.conversationId);

  if (!activeSkill && input.isNewConversation) {
    if (input.preSelectedSkillId) {
      const selected = await skillsService.getSkillForUser(
        input.preSelectedSkillId,
        input.userId,
      );
      if (selected) {
        await skillsService.activateSkill(
          selected.id,
          input.conversationId,
          input.userId,
          'manual',
          'Pre-selected by user',
        );
        activeSkill = selected;
      }
    }

    if (!activeSkill && input.defaultSkillName) {
      const defaultByName = await skillsService.getSkillByName(
        input.defaultSkillName,
        input.userId,
      );
      if (defaultByName) {
        await skillsService.activateSkill(
          defaultByName.id,
          input.conversationId,
          input.userId,
          'manual',
          'Domain default skill',
        );
        activeSkill = defaultByName;
      }
    }

    if (!activeSkill) {
      const userDefault = await skillsService.getDefaultUserSkill(input.userId);
      if (userDefault) {
        await skillsService.activateSkill(
          userDefault.id,
          input.conversationId,
          input.userId,
          'auto',
          'Default skill activated',
        );
        activeSkill = userDefault;
      }
    }
  }

  const manuallyLocked = activeSkill
    ? await pool.query(
      `SELECT trigger_type FROM skill_usage
       WHERE conversation_id = $1 AND skill_id = $2
       ORDER BY started_at DESC LIMIT 1`,
      [input.conversationId, activeSkill.id],
    ).then((result) => result.rows[0]?.trigger_type === 'manual').catch(() => false)
    : false;

  if (!manuallyLocked && (!input.preSelectedSkillId || !input.isNewConversation)) {
    const availableSkills = await skillsService.getAvailableSkills(input.userId);
    const candidates = availableSkills.filter((skill) => skill.id !== activeSkill?.id);
    const detected = await skillsService.detectIntent(input.message, candidates);
    if (detected) {
      await skillsService.activateSkill(
        detected.id,
        input.conversationId,
        input.userId,
        'auto',
        input.message,
      );
      activeSkill = detected;
      input.emit({
        type: 'skill_activated',
        skill: {
          id: detected.id,
          name: detected.name,
          display_name: detected.display_name,
        },
      });
    }
  }

  return activeSkill;
}
