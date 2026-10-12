/**
 * /api/domains/skill-chat/history — Persisted skill-chat turns for one skill
 *
 * GET ?skillId=... — used to hydrate the Skill Assistant chat panel so the
 * conversation survives a skill switch or page reload (see route.ts sibling).
 */

import {
  authenticationErrorResponse,
  requireCurrentAdmin,
} from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';
import { skillChatHistoryService } from '@/app/services/skills/skill-chat-history.service';

const skillsService = new SkillsService();

const SKILL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,35}$/i;

export async function GET(request: Request) {
  let user;
  try {
    user = await requireCurrentAdmin();
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  const skillId = new URL(request.url).searchParams.get('skillId');
  if (!skillId || !SKILL_ID_PATTERN.test(skillId)) {
    return Response.json({ error: 'Invalid skillId' }, { status: 400 });
  }

  const skill = await skillsService.getSkillForUser(skillId, user.id);
  if (!skill) {
    return Response.json({ error: 'Skill not found' }, { status: 404 });
  }

  const messages = await skillChatHistoryService.getHistory(skillId, user.id);
  return Response.json({ messages });
}
