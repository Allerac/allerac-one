/**
 * /api/skill-eval — Skill Quality Evaluation (CI/CD for Skills)
 *
 * Runs quality test cases against a skill using LLM-as-judge.
 * Each case: generates a response with the skill's system prompt,
 * then judges it against explicit criteria.
 *
 * SSE events:
 *   {"type":"case_start","caseId":"...","description":"...","caseIdx":0,"total":3}
 *   {"type":"generating"}
 *   {"type":"judging"}
 *   {"type":"case_done","caseId":"...","scorePct":80,"criteria":[{label,pass,reason}],"response":"..."}
 *   {"type":"case_error","caseId":"...","message":"..."}
 *   {"type":"done","runId":"...","overallPct":75}
 *   {"type":"error","message":"..."}
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SkillsService } from '@/app/services/skills/skills.service';
import pool from '@/app/clients/db';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const authService        = new AuthService();
const userSettingsService = new UserSettingsService();
const skillsService      = new SkillsService();

const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

interface EvalCase {
  id: string;
  description: string;
  prompt: string;
  criteria: string[];
}

interface EvalFile {
  skill: string;
  version?: string;
  description?: string;
  cases: EvalCase[];
}

interface CriterionResult {
  label: string;
  pass: boolean;
  reason: string;
}

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

async function generateResponse(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  provider: string,
  githubToken: string,
): Promise<string> {
  if (provider === 'ollama') {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        stream: false,
        options: { temperature: 0.7, num_predict: 1000 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.message?.content ?? '';
  } else {
    const res = await fetch(`${GITHUB_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${githubToken}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub Models error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}

async function judgeResponse(
  skillName: string,
  prompt: string,
  response: string,
  criteria: string[],
  model: string,
  provider: string,
  githubToken: string,
): Promise<CriterionResult[]> {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const judgePrompt = `You are an expert evaluator assessing an AI response quality for the "${skillName}" skill.

User prompt: "${prompt}"

AI Response:
"""
${response}
"""

Evaluate each criterion below. For each, determine PASS (true) or FAIL (false) and give a ONE-line reason.

Criteria:
${criteriaList}

Return ONLY a valid JSON array with exactly ${criteria.length} objects, no other text, no markdown:
[{"label":"criterion text","pass":true,"reason":"one-line explanation"},...]`;

  // Use GitHub Models for judging even if generation used Ollama — better instruction following
  const judgeModel = provider === 'github' ? model : 'gpt-4o-mini';
  const judgeProvider = githubToken ? 'github' : provider;

  const res = await fetch(`${GITHUB_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${githubToken}`,
    },
    body: JSON.stringify({
      model: judgeModel,
      messages: [{ role: 'user', content: judgePrompt }],
      temperature: 0.1,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';

  // Extract JSON from response (model may add markdown fences)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // Fallback: return all fail with parse error
    return criteria.map(c => ({ label: c, pass: false, reason: 'Judge returned unparseable response' }));
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as CriterionResult[];
    // Ensure all criteria are covered
    return criteria.map((c, i) => parsed[i] ?? { label: c, pass: false, reason: 'Missing from judge response' });
  } catch {
    return criteria.map(c => ({ label: c, pass: false, reason: 'JSON parse error' }));
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }
  const user = await authService.validateSession(sessionToken);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  }

  const body = await request.json();
  const { skill: skillName, model: modelId, provider } = body as { skill: string; model: string; provider: string };

  if (!skillName || !modelId || !provider) {
    return new Response(JSON.stringify({ error: 'skill, model, and provider are required' }), { status: 400 });
  }

  const settings = await userSettingsService.loadUserSettings(user.id);
  const githubToken = settings?.github_token || '';
  const userId = user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (data: Uint8Array) => {
        try { controller.enqueue(data); } catch { /* closed */ }
      };

      try {
        // Load benchmark file
        const benchmarkPath = path.join(process.cwd(), 'benchmarks', `${skillName}.yaml`);
        let evalFile: EvalFile;
        try {
          const content = await fs.readFile(benchmarkPath, 'utf-8');
          evalFile = yaml.load(content) as EvalFile;
        } catch {
          safeEnqueue(encode({ type: 'error', message: `No benchmark file found for skill: ${skillName}` }));
          controller.close();
          return;
        }

        // Load skill system prompt from DB
        const skill = await skillsService.getSkillByName(skillName, userId);
        if (!skill) {
          safeEnqueue(encode({ type: 'error', message: `Skill not found: ${skillName}` }));
          controller.close();
          return;
        }

        const runId = crypto.randomUUID();
        const cases = evalFile.cases ?? [];
        const allScores: number[] = [];

        for (let i = 0; i < cases.length; i++) {
          const evalCase = cases[i];

          safeEnqueue(encode({
            type: 'case_start',
            caseId: evalCase.id,
            description: evalCase.description,
            caseIdx: i,
            total: cases.length,
          }));

          try {
            // Step 1: Generate response using the skill's system prompt
            safeEnqueue(encode({ type: 'generating', caseId: evalCase.id }));
            const response = await generateResponse(
              skill.content,
              evalCase.prompt,
              modelId,
              provider,
              githubToken,
            );

            // Step 2: Judge the response
            safeEnqueue(encode({ type: 'judging', caseId: evalCase.id }));
            const criteriaResults = await judgeResponse(
              skillName,
              evalCase.prompt,
              response,
              evalCase.criteria,
              modelId,
              provider,
              githubToken,
            );

            const passed = criteriaResults.filter(c => c.pass).length;
            const scorePct = Math.round((passed / criteriaResults.length) * 100);
            allScores.push(scorePct);

            // Store result
            await pool.query(
              `INSERT INTO skill_eval_results
                (user_id, run_id, skill_name, skill_version, model, provider, case_id, case_description, prompt, response, criteria, score_pct)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                userId, runId, skillName, evalFile.version ?? null, modelId, provider,
                evalCase.id, evalCase.description, evalCase.prompt, response,
                JSON.stringify(criteriaResults), scorePct,
              ]
            );

            safeEnqueue(encode({
              type: 'case_done',
              caseId: evalCase.id,
              scorePct,
              criteria: criteriaResults,
              response: response.slice(0, 500), // truncate for UI
            }));

          } catch (err: any) {
            safeEnqueue(encode({ type: 'case_error', caseId: evalCase.id, message: err.message }));
          }
        }

        const overallPct = allScores.length > 0
          ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
          : 0;

        safeEnqueue(encode({ type: 'done', runId, overallPct }));

      } catch (err: any) {
        safeEnqueue(encode({ type: 'error', message: err.message }));
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });

  const { searchParams } = new URL(request.url);
  const skillName = searchParams.get('skill');
  const limit = parseInt(searchParams.get('limit') ?? '10');

  const query = skillName
    ? `SELECT run_id, skill_name, skill_version, model, provider, AVG(score_pct) as overall_pct, COUNT(*) as case_count, MIN(created_at) as created_at
       FROM skill_eval_results WHERE user_id = $1 AND skill_name = $2
       GROUP BY run_id, skill_name, skill_version, model, provider
       ORDER BY created_at DESC LIMIT $3`
    : `SELECT run_id, skill_name, skill_version, model, provider, AVG(score_pct) as overall_pct, COUNT(*) as case_count, MIN(created_at) as created_at
       FROM skill_eval_results WHERE user_id = $1
       GROUP BY run_id, skill_name, skill_version, model, provider
       ORDER BY created_at DESC LIMIT $2`;

  const params = skillName ? [user.id, skillName, limit] : [user.id, limit];
  const result = await pool.query(query, params);

  return new Response(JSON.stringify(result.rows), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function DELETE(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  const user = await authService.validateSession(sessionToken);
  if (!user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });

  await pool.query('DELETE FROM skill_eval_results WHERE user_id = $1', [user.id]);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}
