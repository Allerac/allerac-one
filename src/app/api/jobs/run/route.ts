/**
 * POST /api/jobs/run
 *
 * Internal endpoint called by the Go notifier to execute a scheduled job
 * through the full Allerac chat pipeline (with tools, skill, memory).
 *
 * Auth: Authorization: Bearer {EXECUTOR_SECRET}
 */

import { handleChatMessage } from '@/app/services/chat/chat-handler';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { buildSoul } from '@/app/config/allerac-soul';
import { MODELS } from '@/app/services/llm/models';
import pool from '@/app/clients/db';

const userSettingsService   = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

const EXECUTOR_SECRET = process.env.EXECUTOR_SECRET ?? '';

export async function POST(request: Request): Promise<Response> {
  // Auth
  const auth = request.headers.get('Authorization') ?? '';
  if (!EXECUTOR_SECRET || auth !== `Bearer ${EXECUTOR_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { jobId: string; userId: string; prompt: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { jobId, userId, prompt } = body;
  if (!jobId || !userId || !prompt) {
    return Response.json({ error: 'Missing jobId, userId or prompt' }, { status: 400 });
  }

  try {
    // Load settings
    const [settings, sysSettings] = await Promise.all([
      userSettingsService.loadUserSettings(userId),
      systemSettingsService.loadAll(),
    ]);

    const githubToken    = settings?.github_token    || sysSettings.github_token    || process.env.GITHUB_TOKEN || '';
    const tavilyApiKey   = settings?.tavily_api_key  || sysSettings.tavily_api_key  || process.env.TAVILY_API_KEY || undefined;
    const googleApiKey   = settings?.google_api_key  || sysSettings.google_api_key  || '';
    const anthropicApiKey = settings?.anthropic_api_key || sysSettings.anthropic_api_key || '';

    // Pick best available model (prefer gemini-flash if configured, fallback to ollama)
    let selectedModel  = 'qwen2.5:3b';
    let modelProvider: 'github' | 'ollama' | 'gemini' | 'anthropic' = 'ollama';
    let modelBaseUrl   = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

    if (googleApiKey) {
      selectedModel = 'gemini-2.5-flash';
      modelProvider = 'gemini';
      modelBaseUrl  = 'https://generativelanguage.googleapis.com/v1beta/openai';
    } else if (githubToken) {
      selectedModel = 'gpt-4o-mini';
      modelProvider = 'github';
      modelBaseUrl  = 'https://models.inference.ai.azure.com';
    } else if (anthropicApiKey) {
      selectedModel = 'claude-haiku-4-5-20251001';
      modelProvider = 'anthropic';
      modelBaseUrl  = 'https://api.anthropic.com';
    }

    // Build system message
    const now      = new Date();
    const userTz   = settings?.timezone || 'UTC';
    const todayStr = new Intl.DateTimeFormat('en-US', {
      timeZone: userTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'long',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(now).replace(/(\d+)\/(\d+)\/(\d+),/, '$3-$1-$2');

    let systemMessage = buildSoul('jobs');
    systemMessage += `\n\n## Context\n- Current date & time: ${todayStr} (${userTz})`;

    // Append user name if available
    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
    const userName = userRes.rows[0]?.name;
    if (userName) systemMessage += `\n- User: ${userName}`;

    const result = await handleChatMessage(prompt, null, {
      userId,
      githubToken,
      geminiToken:    googleApiKey || undefined,
      anthropicToken: anthropicApiKey || undefined,
      tavilyApiKey,
      selectedModel,
      modelProvider,
      modelBaseUrl,
      systemMessage,
      domainSlug: 'jobs',
    });

    console.log(`[JobsRunner] Job ${jobId} completed — ${result.response.length} chars`);
    return Response.json({ result: result.response });

  } catch (error: any) {
    console.error(`[JobsRunner] Job ${jobId} failed:`, error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
