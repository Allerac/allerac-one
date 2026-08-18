/**
 * /api/domains/skill-chat/apply — Apply approved skill-chat proposals
 *
 * Applies approved {old, new} substitutions to a skill's system prompt via
 * skillsService.updateSkill (owner-or-admin), so an admin configuring a
 * domain's skill from /domains can apply changes even on a skill they don't
 * personally own. This intentionally does NOT reuse /api/skill-eval/apply,
 * whose stricter ownership check (no admin bypass) is a deliberate, tested
 * security boundary for that separate surface.
 *
 * POST body: { skillId: string, changes: [{old, new, rationale}] }
 * Response: { ok: true, updatedContent: string }
 */

import {
  authenticationErrorResponse,
  requireCurrentAdmin,
} from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';

const skillsService = new SkillsService();

const SKILL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,35}$/i;
const MAX_CHANGES = 6;
const MAX_CHANGE_TEXT_LENGTH = 20_000;

interface Change {
  old: string;
  new: string;
  rationale: string;
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireCurrentAdmin();
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  let body: { skillId?: string; changes?: Change[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { skillId, changes } = body;
  if (
    !skillId
    || !SKILL_ID_PATTERN.test(skillId)
    || !Array.isArray(changes)
    || changes.length === 0
    || changes.length > MAX_CHANGES
    || changes.some((change) => (
      typeof change?.old !== 'string'
      || typeof change?.new !== 'string'
      || typeof change?.rationale !== 'string'
      || change.old.length > MAX_CHANGE_TEXT_LENGTH
      || change.new.length > MAX_CHANGE_TEXT_LENGTH
    ))
  ) {
    return Response.json({ error: 'Invalid skillId or changes' }, { status: 400 });
  }

  const skill = await skillsService.getSkillForUser(skillId, user.id);
  if (!skill) {
    return Response.json({ error: 'Skill not found' }, { status: 404 });
  }

  let updatedContent = skill.content;
  const applied: string[] = [];
  const failed: string[] = [];

  for (const change of changes) {
    if (!change.old || !updatedContent.includes(change.old)) {
      failed.push(change.old?.slice(0, 60) ?? '(empty)');
      continue;
    }
    updatedContent = updatedContent.replace(change.old, change.new);
    applied.push(change.rationale);
  }

  if (applied.length === 0) {
    return Response.json({ error: 'No changes could be applied', failed }, { status: 400 });
  }

  const updated = await skillsService.updateSkill(skillId, user.id, user.is_admin, {
    content: updatedContent,
  });
  if (!updated) {
    return Response.json({ error: 'Skill could not be updated' }, { status: 403 });
  }

  return Response.json({
    ok: true,
    applied: applied.length,
    failed: failed.length,
    updatedContent: updated.content,
  });
}
