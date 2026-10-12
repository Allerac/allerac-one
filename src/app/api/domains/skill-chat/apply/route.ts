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
 * POST body: { skillId: string, changes: [{old, new, rationale}], messageId?: string }
 * Response: { ok: true, updatedContent: string }
 *
 * `messageId` (the skill-chat assistant turn these changes came from, if any)
 * is optional so this endpoint stays usable by any future caller that applies
 * changes outside that chat flow.
 */

import {
  authenticationErrorResponse,
  requireCurrentAdmin,
} from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';
import { skillChatHistoryService } from '@/app/services/skills/skill-chat-history.service';

const skillsService = new SkillsService();

const SKILL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,35}$/i;
const MESSAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,35}$/i;
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

  let body: { skillId?: string; changes?: Change[]; messageId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { skillId, changes, messageId } = body;
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
    || (messageId !== undefined && !MESSAGE_ID_PATTERN.test(messageId))
  ) {
    return Response.json({ error: 'Invalid skillId, changes, or messageId' }, { status: 400 });
  }

  const skill = await skillsService.getSkillForUser(skillId, user.id);
  if (!skill) {
    return Response.json({ error: 'Skill not found' }, { status: 404 });
  }

  let updatedContent = skill.content;
  const applied: string[] = [];
  const appliedChanges: Change[] = [];
  const failed: string[] = [];

  for (const change of changes) {
    if (!change.old || !updatedContent.includes(change.old)) {
      failed.push(change.old?.slice(0, 60) ?? '(empty)');
      continue;
    }
    updatedContent = updatedContent.replace(change.old, change.new);
    applied.push(change.rationale);
    appliedChanges.push(change);
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

  if (messageId) {
    try {
      await skillChatHistoryService.recordAppliedChanges(messageId, user.id, appliedChanges);
    } catch (err) {
      console.error('[SkillChatApply] Failed to record applied changes:', err);
    }
  }

  return Response.json({
    ok: true,
    applied: applied.length,
    failed: failed.length,
    updatedContent: updated.content,
  });
}
