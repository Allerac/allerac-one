/**
 * /api/skill-eval/apply — Apply approved skill improvements
 *
 * Applies text substitutions to the skill's system prompt,
 * updates the DB immediately, and writes to the mounted skills file.
 *
 * POST body: { skillName: string, changes: [{old, new, rationale}] }
 * Response: { ok: true, updatedContent: string }
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { SkillsService } from '@/app/services/skills/skills.service';
import pool from '@/app/clients/db';
import fs from 'fs/promises';
import path from 'path';

const authService   = new AuthService();
const skillsService = new SkillsService();

const SKILLS_DIR = process.env.SKILLS_DIR || '/app/skills';

interface Change {
  old: string;
  new: string;
  rationale: string;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });

  const { skillName, changes } = await request.json() as { skillName: string; changes: Change[] };
  if (!skillName || !Array.isArray(changes) || changes.length === 0) {
    return new Response(JSON.stringify({ error: 'skillName and changes required' }), { status: 400 });
  }

  // Load skill from DB
  const skill = await skillsService.getSkillByName(skillName, user.id);
  if (!skill) {
    return new Response(JSON.stringify({ error: `Skill not found: ${skillName}` }), { status: 404 });
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
     WHERE name = $2 AND (is_system = true OR user_id = $3)`,
    [updatedContent, skillName, user.id]
  );

  console.log(`[SkillImprove] Applied ${applied.length} improvement(s) to skill: ${skillName}`);

  // Write to mounted skills file (best effort — persists across container restarts)
  const skillFile = path.join(SKILLS_DIR, `${skillName}.md`);
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

  return new Response(JSON.stringify({
    ok: true,
    applied: applied.length,
    failed: failed.length,
    updatedContent,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
