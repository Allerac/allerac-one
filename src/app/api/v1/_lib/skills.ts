import type { Skill } from '@/app/services/skills/skills.service';

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function skillListDto(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    displayName: skill.display_name,
    description: skill.description,
    category: skill.category,
    shared: skill.shared,
    verified: skill.verified,
    createdAt: iso(skill.created_at),
    updatedAt: iso(skill.updated_at),
  };
}

export function skillDetailDto(skill: Skill) {
  return {
    ...skillListDto(skill),
    systemPrompt: skill.content,
  };
}
