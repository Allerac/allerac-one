import { z } from 'zod';
import { SkillsService } from '@/app/services/skills/skills.service';
import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';
import { skillListDto } from '../_lib/skills';

const createSkillSchema = z.object({
  name: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  description: z.string().trim().min(1),
  systemPrompt: z.string().min(1),
  category: z.string().optional(),
  shared: z.boolean().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('skills:read', request);
    const skillsService = new SkillsService();
    const skills = await skillsService.getAvailableSkills(user.id);
    return apiData({ skills: skills.map(skillListDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/skills failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('skills:write', request);
    const parsed = createSkillSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid skill payload', 400, parsed.error.flatten());
    }

    const skillsService = new SkillsService();
    const skill = await skillsService.createSkill({
      user_id: user.id,
      name: parsed.data.name,
      display_name: parsed.data.displayName,
      description: parsed.data.description,
      content: parsed.data.systemPrompt,
      category: parsed.data.category ?? 'workflow',
      shared: parsed.data.shared ?? false,
      learning_enabled: false,
      memory_scope: 'user',
      rag_integration: false,
    });

    return apiData({ skill: skillListDto(skill) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/skills failed', error);
  }
}
