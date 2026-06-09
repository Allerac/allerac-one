/**
 * /api/skill-eval/apply — Apply approved skill improvements
 *
 * Applies text substitutions to the skill's system prompt,
 * updates the DB immediately, and writes to the mounted skills file.
 *
 * POST body: { skillName: string, changes: [{old, new, rationale}] }
 * Response: { ok: true, updatedContent: string }
 */

import {
  authenticationErrorResponse,
  ForbiddenError,
  requireCurrentAdmin,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';
import pool from '@/app/clients/db';
import fs from 'fs/promises';
import path from 'path';

const skillsService = new SkillsService();

const SKILLS_DIR = process.env.SKILLS_DIR || '/app/skills';
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const MAX_CHANGES = 4;
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

  let body: { skillName?: string; changes?: Change[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { skillName, changes } = body;
  if (
    !skillName
    || !SKILL_NAME_PATTERN.test(skillName)
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
    return Response.json({ error: 'Invalid skillName or changes' }, { status: 400 });
  }

  // Load skill from DB
  const skill = await skillsService.getSkillByName(skillName, user.id);
  if (!skill) {
    return new Response(JSON.stringify({ error: `Skill not found: ${skillName}` }), { status: 404 });
  }
  const systemSkill = skill as typeof skill & {
    is_system?: boolean;
    source_file?: string | null;
  };
  if (!systemSkill.is_system && skill.user_id !== user.id) {
    return Response.json({ error: 'Skill cannot be modified' }, { status: 403 });
  }

  // Apply changes sequentially
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
    return new Response(JSON.stringify({ error: 'No changes could be applied', failed }), { status: 400 });
  }

  // Update DB immediately (takes effect on next LLM request)
  await pool.query(
    `UPDATE skills SET content = $1, updated_at = NOW()
     WHERE id = $2 AND (is_system = true OR user_id = $3)`,
    [updatedContent, skill.id, user.id]
  );

  console.log(`[SkillImprove] Applied ${applied.length} improvement(s) to skill: ${skillName}`);

  // Write to mounted skills file (best effort — persists across container restarts)
  const sourceFile = systemSkill.source_file;
  if (
    systemSkill.is_system
    && sourceFile
    && path.basename(sourceFile) === sourceFile
    && sourceFile.endsWith('.md')
  ) {
    const skillFile = path.join(SKILLS_DIR, sourceFile);
    try {
      const raw = await fs.readFile(skillFile, 'utf-8');
      // Replace only the content section (after frontmatter)
      const frontmatterMatch = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
      if (frontmatterMatch) {
        const newFileContent = frontmatterMatch[1] + '\n' + updatedContent + '\n';
        await fs.writeFile(skillFile, newFileContent, 'utf-8');
        console.log(`[SkillImprove] Written to ${skillFile}`);
      }
    } catch (err) {
      // Non-fatal: DB is already updated
      console.warn(`[SkillImprove] Could not write file ${skillFile}:`, err);
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    applied: applied.length,
    failed: failed.length,
    updatedContent,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
