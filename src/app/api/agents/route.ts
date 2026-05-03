/**
 * /api/agents — Parallel agent execution via orchestrator + workers pattern
 *
 * SSE event protocol:
 *   data: {"type":"agent_run_started","runId":"..."}
 *   data: {"type":"orchestrator_planning"}
 *   data: {"type":"orchestrator_planned","workers":[...]}
 *   data: {"type":"worker_started","workerId":"...","name":"...","task":"..."}
 *   data: {"type":"worker_token","workerId":"...","content":"..."}
 *   data: {"type":"worker_tool_call","workerId":"...","tool":"...","args":{...}}
 *   data: {"type":"worker_completed","workerId":"...","result":"..."}
 *   data: {"type":"worker_failed","workerId":"...","error":"..."}
 *   data: {"type":"orchestrator_aggregating"}
 *   data: {"type":"aggregator_token","content":"..."}
 *   data: {"type":"run_completed","result":"..."}
 *   data: {"type":"error","message":"..."}
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { ChatService } from '@/app/services/database/chat.service';
import { OrchestratorService } from '@/app/services/agents/orchestrator.service';
import { WorkerService } from '@/app/services/agents/worker.service';
import pool from '@/app/clients/db';
import { v4 as uuid } from 'uuid';

const authService = new AuthService();
const userSettingsService = new UserSettingsService();
const chatService = new ChatService();
const orchestratorService = new OrchestratorService();
const workerService = new WorkerService();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

function encode(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const {
    message,
    conversationId: inputConversationId,
    model: modelId,
    provider,
  }: {
    message: string;
    conversationId: string | null;
    model: string;
    provider: 'github' | 'ollama' | 'gemini' | 'anthropic';
  } = body;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));

      let streamClosed = false;
      request.signal?.addEventListener('abort', () => {
        streamClosed = true;
      });
      const safeEnqueue = (data: Uint8Array) => {
        if (streamClosed) return;
        try {
          controller.enqueue(data);
        } catch {
          streamClosed = true;
        }
      };

      try {
        // 1. Authenticate
        if (!sessionToken) {
          safeEnqueue(encode({ type: 'error', message: 'Unauthorized' }));
          controller.close();
          return;
        }

        const user = await authService.validateSession(sessionToken);
        if (!user) {
          safeEnqueue(encode({ type: 'error', message: 'Unauthorized' }));
          controller.close();
          return;
        }

        const userId = user.id;
        console.log('[AgentRoute] Starting agent run for user:', userId);

        // 2. Load user settings
        const settings = await userSettingsService.loadUserSettings(userId);
        const githubToken = settings?.github_token || process.env.GITHUB_TOKEN || '';
        const tavilyApiKey = settings?.tavily_api_key || process.env.TAVILY_API_KEY || undefined;
        const googleApiKey = settings?.google_api_key || '';
        const anthropicApiKey = settings?.anthropic_api_key || '';

        // 3. Get model base URL
        const modelBaseUrl =
          provider === 'ollama'
            ? OLLAMA_BASE_URL
            : provider === 'gemini'
              ? GEMINI_BASE_URL
              : provider === 'anthropic'
                ? ANTHROPIC_BASE_URL
                : GITHUB_BASE_URL;

        // 4. Create or find conversation
        let convId = inputConversationId ?? null;
        if (!convId) {
          const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          convId = await chatService.createConversation(userId, title);
          if (!convId) throw new Error('Failed to create conversation');
        }

        // 5. Create agent_run record
        const runId = uuid();
        const systemMessage = settings?.system_message || 'You are a helpful AI assistant.';

        await pool.query(
          `INSERT INTO agent_runs (id, conversation_id, user_id, status, prompt)
           VALUES ($1, $2, $3, $4, $5)`,
          [runId, convId, userId, 'planning', message]
        );

        safeEnqueue(encode({ type: 'agent_run_started', runId }));
        console.log('[AgentRoute] Created run:', runId);

        // 6. Save user message to conversation
        await chatService.saveMessage(convId, 'user', message);

        // 7. Orchestrator: planning phase
        safeEnqueue(encode({ type: 'orchestrator_planning' }));
        console.log('[AgentRoute] Orchestrator planning...');

        const plan = await orchestratorService.createPlan(message, modelId, provider, modelBaseUrl);

        safeEnqueue(encode({ type: 'orchestrator_planned', workers: plan.workers }));
        console.log('[AgentRoute] Plan created with', plan.workers.length, 'workers');

        // Update run with plan
        await pool.query(`UPDATE agent_runs SET plan = $1, status = $2 WHERE id = $3`, [JSON.stringify(plan), 'running', runId]);

        // 8. Create worker records
        const workerIds: string[] = [];
        for (const workerSpec of plan.workers) {
          const workerId = uuid();
          workerIds.push(workerId);
          await pool.query(
            `INSERT INTO agent_workers (id, run_id, name, task, status)
             VALUES ($1, $2, $3, $4, $5)`,
            [workerId, runId, workerSpec.name, workerSpec.task, 'waiting']
          );
        }

        // 9. Execute workers in parallel
        console.log('[AgentRoute] Spawning', plan.workers.length, 'workers...');

        const workerPromises = plan.workers.map((spec, idx) => {
          const workerId = workerIds[idx];
          return (async () => {
            safeEnqueue(encode({ type: 'worker_started', workerId, name: spec.name, task: spec.task }));

            await pool.query(`UPDATE agent_workers SET status = $1, started_at = NOW() WHERE id = $2`, ['running', workerId]);

            const result = await workerService.executeWorker(
              spec,
              {
                userId,
                githubToken,
                geminiToken: googleApiKey || undefined,
                anthropicToken: anthropicApiKey,
                tavilyApiKey,
                selectedModel: modelId,
                modelProvider: provider,
                modelBaseUrl,
                systemMessage,
              },
              (token: string) => {
                safeEnqueue(encode({ type: 'worker_token', workerId, content: token }));
              },
              (tool: string, args: any) => {
                safeEnqueue(encode({ type: 'worker_tool_call', workerId, tool, args }));
              }
            );

            if (result.success) {
              await pool.query(
                `UPDATE agent_workers SET status = $1, result = $2, tokens_used = $3, completed_at = NOW() WHERE id = $4`,
                ['completed', result.result, result.tokensUsed, workerId]
              );
              safeEnqueue(encode({ type: 'worker_completed', workerId, result: result.result }));
            } else {
              await pool.query(`UPDATE agent_workers SET status = $1, completed_at = NOW() WHERE id = $2`, ['failed', workerId]);
              safeEnqueue(encode({ type: 'worker_failed', workerId, error: result.error }));
            }

            return result;
          })();
        });

        const workerResults = await Promise.all(workerPromises);
        console.log('[AgentRoute] All workers completed');

        // 10. Orchestrator: aggregation phase
        safeEnqueue(encode({ type: 'orchestrator_aggregating' }));
        console.log('[AgentRoute] Orchestrator aggregating results...');

        await pool.query(`UPDATE agent_runs SET status = $1 WHERE id = $2`, ['aggregating', runId]);

        // Build aggregation stream
        let finalResponse = '';
        const aggregateStream = orchestratorService.aggregateResults(message, plan, workerResults, modelId, provider, modelBaseUrl);

        for await (const token of aggregateStream) {
          safeEnqueue(encode({ type: 'aggregator_token', content: token }));
          finalResponse += token;
        }

        // 11. Save final message and mark run as completed
        await chatService.saveMessage(convId, 'assistant', finalResponse, { agentRunId: runId });

        await pool.query(
          `UPDATE agent_runs SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
          ['completed', finalResponse, runId]
        );

        safeEnqueue(encode({ type: 'run_completed', result: finalResponse }));
        console.log('[AgentRoute] Agent run completed:', runId);

        controller.close();
      } catch (error: any) {
        console.error('[AgentRoute] Error:', error);
        safeEnqueue(encode({ type: 'error', message: error.message || 'Unknown error' }));
        controller.close();
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
