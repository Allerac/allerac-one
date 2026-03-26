/**
 * /api/skill-eval/improve — Skill Self-Improvement via LLM Analysis
 *
 * Analyzes failing eval cases for a skill and proposes targeted,
 * minimal changes to the system prompt to fix them.
 *
 * POST body: { skillName: string, runId: string }
 * Response: { analysis: string, changes: ProposedChange[] }
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SkillsService } from '@/app/services/skills/skills.service';
import pool from '@/app/clients/db';

const authService         = new AuthService();
const userSettingsService = new UserSettingsService();
const skillsService       = new SkillsService();

const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';

export interface ProposedChange {
  old: string;
  new: string;
  rationale: string;
}

interface ImproveResponse {
  analysis: string;
  changes: ProposedChange[];
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });

  const { skillName, runId } = await request.json() as { skillName: string; runId: string };
  if (!skillName || !runId) {
    return new Response(JSON.stringify({ error: 'skillName and runId required' }), { status: 400 });
  }

  const settings = await userSettingsService.loadUserSettings(user.id);
  const githubToken = settings?.github_token;
  if (!githubToken) {
    return new Response(JSON.stringify({ error: 'GitHub token not configured — needed for improvement analysis' }), { status: 400 });
  }

  // Load failing cases for this run
  const casesResult = await pool.query(
    `SELECT case_id, case_description, prompt, response, criteria, score_pct
     FROM skill_eval_results
     WHERE user_id = $1 AND run_id = $2 AND skill_name = $3 AND score_pct < 100
     ORDER BY score_pct ASC`,
    [user.id, runId, skillName]
  );

  if (casesResult.rows.length === 0) {
    return new Response(JSON.stringify({ analysis: 'All cases passed! No improvements needed.', changes: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Load current skill content
  const skill = await skillsService.getSkillByName(skillName, user.id);
  if (!skill) {
    return new Response(JSON.stringify({ error: `Skill not found: ${skillName}` }), { status: 404 });
  }

  // Build the improve prompt
  const failingSummary = casesResult.rows.map((row: any) => {
    const criteria = row.criteria as Array<{ label: string; pass: boolean; reason: string }>;
    const failing = criteria.filter(c => !c.pass);
    return [
      `### Case: "${row.case_id}" (score: ${row.score_pct}%)`,
      `Prompt: "${row.prompt}"`,
      `Response preview: "${(row.response ?? '').slice(0, 400)}..."`,
      `Failed criteria:`,
      ...failing.map(c => `  - FAIL: "${c.label}"\n    Reason: ${c.reason}`),
    ].join('\n');
  }).join('\n\n');

  const improvePrompt = `You are an expert AI prompt engineer specializing in writing system prompts.

You must propose MINIMAL, TARGETED improvements to fix specific failing quality criteria.

## Skill: ${skillName}
## Current system prompt content (the markdown body, after YAML frontmatter):

\`\`\`
${skill.content}
\`\`\`

## Failing eval cases:

${failingSummary}

## Your task:

Propose the SMALLEST possible changes to the system prompt that would fix the failing criteria.
Rules:
1. Each change MUST have an "old" value that is an EXACT verbatim substring of the current system prompt content above
2. Prefer adding explicit prohibitions ("NEVER write X", "DO NOT start with Y") over rewrites
3. Keep the skill's voice and personality — only fix what's broken
4. Maximum 4 changes — be surgical, not comprehensive
5. If the same pattern causes multiple failures, one targeted fix covers all

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON:
{
  "analysis": "2-3 sentences: root cause of the failures and what specifically needs to change",
  "changes": [
    {
      "old": "exact substring from the current system prompt to replace",
      "new": "replacement text that fixes the failing criteria",
      "rationale": "one line: which criteria this fixes and why"
    }
  ]
}`;

  const res = await fetch(`${GITHUB_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${githubToken}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: improvePrompt }],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ error: `LLM error: ${text.slice(0, 200)}` }), { status: 500 });
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';

  // Extract JSON (model may sometimes add backticks despite instructions)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return new Response(JSON.stringify({ error: 'LLM returned unparseable response', raw: content.slice(0, 500) }), { status: 500 });
  }

  let result: ImproveResponse;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch {
    return new Response(JSON.stringify({ error: 'JSON parse error', raw: content.slice(0, 500) }), { status: 500 });
  }

  // Validate that "old" values exist in the current content
  const validChanges = (result.changes ?? []).filter(c => {
    if (!c.old) return false;
    if (!skill.content.includes(c.old)) {
      console.warn(`[SkillImprove] Change old text not found in skill content: "${c.old.slice(0, 80)}..."`);
      return false;
    }
    return true;
  });

  return new Response(JSON.stringify({
    analysis: result.analysis ?? '',
    changes: validChanges,
    skipped: (result.changes ?? []).length - validChanges.length,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
