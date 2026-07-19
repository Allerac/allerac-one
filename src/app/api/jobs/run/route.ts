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
import pool from '@/app/clients/db';
import { resolveJobModel, type JobModelProvider } from '@/app/services/scheduled-jobs/job-model';

const userSettingsService   = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

const EXECUTOR_SECRET = process.env.EXECUTOR_SECRET ?? '';

export async function POST(request: Request): Promise<Response> {
  // Auth
  const auth = request.headers.get('Authorization') ?? '';
  if (!EXECUTOR_SECRET || auth !== `Bearer ${EXECUTOR_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { jobId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { jobId } = body;
  if (!jobId) {
    return Response.json({ error: 'Missing jobId' }, { status: 400 });
  }

  try {
    const jobResult = await pool.query<{
      user_id: string;
      prompt: string;
      domain_slug: string | null;
      llm_model: string | null;
      llm_provider: JobModelProvider | null;
    }>(
      `SELECT user_id, prompt, domain_slug, llm_model, llm_provider
       FROM scheduled_jobs
       WHERE id = $1 AND enabled = TRUE`,
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) {
      return Response.json({ error: 'Job not found or disabled' }, { status: 404 });
    }

    const userId = job.user_id;
    const prompt = job.prompt;

    // Load settings
    const [settings, sysSettings] = await Promise.all([
      userSettingsService.loadUserSettings(userId),
      systemSettingsService.loadAll(),
    ]);

    const githubToken    = settings?.github_token    || sysSettings.github_token    || process.env.GITHUB_TOKEN || '';
    const tavilyApiKey   = settings?.tavily_api_key  || sysSettings.tavily_api_key  || process.env.TAVILY_API_KEY || undefined;
    const googleApiKey   = settings?.google_api_key  || sysSettings.google_api_key  || '';
    const anthropicApiKey = settings?.anthropic_api_key || sysSettings.anthropic_api_key || '';

    const { selectedModel, modelProvider, modelBaseUrl } = resolveJobModel(
      job.llm_model,
      job.llm_provider,
      { githubToken, googleApiKey, anthropicApiKey },
    );

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
      domainSlug: job.domain_slug ?? 'jobs',
    });

    console.log(`[JobsRunner] Job ${jobId} completed — ${result.response.length} chars`);
    return Response.json({ result: result.response });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[JobsRunner] Job ${jobId} failed:`, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
