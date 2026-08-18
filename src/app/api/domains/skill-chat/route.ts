/**
 * /api/domains/skill-chat — Conversational skill prompt-engineering assistant
 *
 * The admin chats about how to improve a skill's system prompt; the assistant
 * proposes minimal, surgical changes as strict JSON, which the client renders
 * as a diff for approval (never auto-applied — see /api/domains/skill-chat/apply).
 *
 * POST body: { skillId, domainSlug, model, provider, history: {role,content}[], message }
 * Response: { reply: string, changes: ProposedChange[], skipped: number }
 */

import {
  authenticationErrorResponse,
  requireCurrentAdmin,
} from '@/app/lib/auth-session';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SkillsService } from '@/app/services/skills/skills.service';
import { generateResponse } from '../../skill-eval/generate-response';

const userSettingsService = new UserSettingsService();
const skillsService       = new SkillsService();

const SKILL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,35}$/i;
const DOMAIN_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,49}$/;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_TURNS = 20;
const MAX_CHANGES = 6;

export interface ProposedChange {
  old: string;
  new: string;
  rationale: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface SkillChatResponse {
  reply: string;
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

  let body: {
    skillId?: string;
    domainSlug?: string;
    model?: string;
    provider?: string;
    history?: ChatTurn[];
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { skillId, domainSlug, model, provider, history, message } = body;
  if (
    !skillId || !SKILL_ID_PATTERN.test(skillId)
    || !domainSlug || !DOMAIN_SLUG_PATTERN.test(domainSlug)
    || !model || typeof model !== 'string'
    || !provider || typeof provider !== 'string'
    || !message || typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH
    || (history !== undefined && (
      !Array.isArray(history)
      || history.length > MAX_HISTORY_TURNS
      || history.some(turn => (
        (turn.role !== 'user' && turn.role !== 'assistant')
        || typeof turn.content !== 'string'
        || turn.content.length > MAX_MESSAGE_LENGTH
      ))
    ))
  ) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const settings = await userSettingsService.loadUserSettings(user.id);
  const tokenByProvider: Record<string, string> = {
    github: settings?.github_token || '',
    anthropic: settings?.anthropic_api_key || '',
    gemini: settings?.google_api_key || '',
    openai: settings?.openai_api_key || '',
    ollama: '',
  };
  const missingTokenLabel: Record<string, string> = {
    github: 'GitHub token',
    anthropic: 'Anthropic API key',
    gemini: 'Google API key',
    openai: 'OpenAI API key',
  };
  if (provider !== 'ollama' && !tokenByProvider[provider]) {
    return Response.json({
      error: `${missingTokenLabel[provider] ?? 'API key'} not configured`,
    }, { status: 400 });
  }

  // Load fresh from DB — "old" must match the current content, never a
  // client-cached copy, since skill content has no versioning/undo.
  const skill = await skillsService.getSkillForUser(skillId, user.id);
  if (!skill) {
    return Response.json({ error: 'Skill not found' }, { status: 404 });
  }

  const conversation = (history ?? [])
    .map(turn => `${turn.role === 'user' ? 'Admin' : 'Assistant'}: ${turn.content}`)
    .concat(`Admin: ${message}`)
    .join('\n\n');

  const chatPrompt = `You are an expert AI prompt engineer helping an admin iteratively improve the system prompt for the skill "${skill.name}" (${skill.display_name}), used in the "${domainSlug}" domain of a personal AI assistant platform.

## Current system prompt content (the exact text you may propose edits against):

\`\`\`
${skill.content}
\`\`\`

## Conversation so far:

${conversation}

## Your task

Reply conversationally to the admin's latest message. Whenever you have enough clarity to propose a concrete improvement, include specific, minimal, surgical changes to the system prompt above.

Rules:
1. Each change's "old" MUST be an EXACT verbatim substring of the current system prompt content above.
2. Prefer small, targeted edits (add a rule, tighten a sentence) over full rewrites.
3. Keep the skill's existing voice and personality — only change what the admin is asking about.
4. Maximum ${MAX_CHANGES} changes per reply — be surgical, not comprehensive.
5. If the admin's request is unclear, is just a question, or doesn't require a prompt edit, respond with helpful conversation and an EMPTY "changes" array — do not guess at an edit.

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON:
{
  "reply": "conversational response shown to the admin in the chat",
  "changes": [
    { "old": "exact substring from the current system prompt", "new": "replacement text", "rationale": "one line: why this helps" }
  ]
}`;

  let content: string;
  try {
    content = await generateResponse(
      '', chatPrompt, model, provider,
      tokenByProvider.github, tokenByProvider.anthropic, tokenByProvider.gemini,
      { temperature: 0.3, maxTokens: 1200 }, tokenByProvider.openai,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `LLM error: ${message}` }, { status: 500 });
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: 'LLM returned unparseable response', raw: content.slice(0, 500) }, { status: 500 });
  }

  let result: SkillChatResponse;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch {
    return Response.json({ error: 'JSON parse error', raw: content.slice(0, 500) }, { status: 500 });
  }

  const validChanges = (result.changes ?? []).filter(change => {
    if (!change?.old) return false;
    if (!skill.content.includes(change.old)) {
      console.warn(`[SkillChat] Change old text not found in skill content: "${change.old.slice(0, 80)}..."`);
      return false;
    }
    return true;
  }).slice(0, MAX_CHANGES);

  return Response.json({
    reply: result.reply ?? '',
    changes: validChanges,
    skipped: (result.changes ?? []).length - validChanges.length,
  });
}
