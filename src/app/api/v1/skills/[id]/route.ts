import { z } from 'zod';
import { SkillsService } from '@/app/services/skills/skills.service';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { skillDetailDto, skillListDto } from '../../_lib/skills';

const updateSkillSchema = z.object({
  name: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  category: z.string().optional(),
  shared: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('skills:read', request);
    const { id } = await params;
    const skillsService = new SkillsService();
    const skill = await skillsService.getSkillForUser(id, user.id);
    if (!skill) return apiError('not_found', 'Skill not found', 404);
    return apiData({ skill: skillDetailDto(skill) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/skills/:id failed', error);
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('skills:write', request);
    const { id } = await params;
    const parsed = updateSkillSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid skill update payload', 400, parsed.error.flatten());
    }

    const skillsService = new SkillsService();
    const skill = await skillsService.updateSkill(id, user.id, user.isAdmin, {
      name: parsed.data.name,
      display_name: parsed.data.displayName,
      description: parsed.data.description,
      content: parsed.data.systemPrompt,
      category: parsed.data.category,
      shared: parsed.data.shared,
    });

    if (!skill) return apiError('not_found', 'Skill not found', 404);
    return apiData({ skill: skillListDto(skill) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('PATCH /api/v1/skills/:id failed', error);
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  try {
    const user = await requireApiUser('skills:write', request);
    const { id } = await params;
    const skillsService = new SkillsService();

    const skill = await skillsService.getSkillForUser(id, user.id);
    if (!skill || skill.user_id !== user.id) {
      return apiError('not_found', 'Skill not found', 404);
    }

    await skillsService.deleteSkill(id, user.id);
    return apiData({ deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/skills/:id failed', error);
  }
}
