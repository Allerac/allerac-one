/**
 * /api/skill-eval/improve — Skill Self-Improvement via LLM Analysis
 *
 * Analyzes failing eval cases for a skill and proposes targeted,
 * minimal changes to the system prompt to fix them.
 *
 * POST body: { skillName: string, runId: string }
 * Response: { analysis: string, changes: ProposedChange[] }
 */

import {
  authenticationErrorResponse,
  ForbiddenError,
  requireCurrentAdmin,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SkillsService } from '@/app/services/skills/skills.service';
import pool from '@/app/clients/db';
import { generateResponse } from '../generate-response';

const userSettingsService = new UserSettingsService();
const skillsService       = new SkillsService();

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,35}$/i;

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
  let user;
  try {
    user = await requireCurrentAdmin();
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  let body: { skillName?: string; runId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { skillName, runId } = body;
  if (
    !skillName
    || !SKILL_NAME_PATTERN.test(skillName)
    || !runId
    || !RUN_ID_PATTERN.test(runId)
  ) {
    return Response.json({ error: 'Invalid skillName or runId' }, { status: 400 });
  }

  const settings = await userSettingsService.loadUserSettings(user.id);
  const githubToken = settings?.github_token || '';
  const anthropicToken = settings?.anthropic_api_key || '';
  const googleApiKey = settings?.google_api_key || '';

  // Load failing cases for this run — model/provider come from the run itself,
  // so the improvement analysis uses the same LLM the eval was run with.
  const casesResult = await pool.query(
    `SELECT case_id, case_description, prompt, response, criteria, score_pct, model, provider
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

  const { model: runModel, provider: runProvider } = casesResult.rows[0];
  const tokenByProvider: Record<string, string> = {
    github: githubToken,
    anthropic: anthropicToken,
    gemini: googleApiKey,
    ollama: '',
  };
  const missingTokenLabel: Record<string, string> = {
    github: 'GitHub token',
    anthropic: 'Anthropic API key',
    gemini: 'Google API key',
  };
  if (runProvider !== 'ollama' && !tokenByProvider[runProvider]) {
    return new Response(JSON.stringify({
      error: `${missingTokenLabel[runProvider] ?? 'API key'} not configured — needed for improvement analysis`,
    }), { status: 400 });
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

  let content: string;
  try {
    content = await generateResponse(
      '', improvePrompt, runModel, runProvider, githubToken, anthropicToken, googleApiKey,
      { temperature: 0.2, maxTokens: 1500 },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `LLM error: ${err.message ?? err}` }), { status: 500 });
  }

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
