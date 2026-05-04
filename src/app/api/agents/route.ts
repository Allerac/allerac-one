/**
 * /api/agents — Background agent execution with Postgres queue
 *
 * POST /api/agents — Create a new agent run, returns { runId } immediately
 * GET  /api/agents?runId=... — Poll for single run status and results
 * GET  /api/agents — List all runs for current user
 * DELETE /api/agents?runId=... — Cancel a running agent
 */

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { ChatService } from '@/app/services/database/chat.service';
import { WorkerRunRepository } from '@/app/services/agents/worker-run.repository';
import pool from '@/app/clients/db';
import { v4 as uuid } from 'uuid';

const authService = new AuthService();
const userSettingsService = new UserSettingsService();
const chatService = new ChatService();
const repo = new WorkerRunRepository();

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { message, conversationId: inputConversationId, model, provider }: {
      message: string;
      conversationId: string | null;
      model: string;
      provider: string;
    } = body;

    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;
    if (!sessionToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.validateSession(sessionToken);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;
    const llmModel = model || 'qwen2.5:3b';
    const llmProvider = provider || 'ollama';

    // Create or find conversation
    let convId = inputConversationId ?? null;
    if (!convId) {
      const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
      convId = await chatService.createConversation(userId, title);
      if (!convId) {
        return Response.json({ error: 'Failed to create conversation' }, { status: 500 });
      }
    }

    // Create agent_run with pending status (worker picks it up)
    const runId = uuid();
    await pool.query(
      `INSERT INTO agent_runs (id, conversation_id, user_id, status, prompt, llm_model, llm_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [runId, convId, userId, 'pending', message, llmModel, llmProvider]
    );

    // Save user message to conversation
    await chatService.saveMessage(convId, 'user', message);

    // Save assistant placeholder message with agent_run_id so it persists across navigation
    await chatService.saveMessage(convId, 'assistant', '', { agentRunId: runId });

    console.log('[AgentRoute] Created pending run:', runId);
    return Response.json({ runId });
  } catch (error: any) {
    console.error('[AgentRoute] Error creating run:', error);
    return Response.json({ error: error.message || 'Failed to create agent run' }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;
    if (!sessionToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.validateSession(sessionToken);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const runId = request.nextUrl.searchParams.get('runId');

    // Single run detail
    if (runId) {
      const runResult = await pool.query(
        `SELECT id, status, prompt, plan, result, error_message, started_at, completed_at, cancelled_at, llm_model, llm_provider
         FROM agent_runs WHERE id = $1 AND user_id = $2`,
        [runId, user.id]
      );

      if (runResult.rows.length === 0) {
        return Response.json({ error: 'Run not found' }, { status: 404 });
      }

      const run = runResult.rows[0];

      const workersResult = await pool.query(
        `SELECT id, name, task, status, result, tokens_used, progress_log, started_at, completed_at
         FROM agent_workers WHERE run_id = $1 ORDER BY started_at`,
        [runId]
      );

      return Response.json({
        runId: run.id,
        status: run.cancelled_at ? 'cancelled' : run.status,
        prompt: run.prompt,
        plan: run.plan,
        result: run.result,
        error: run.error_message,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        cancelledAt: run.cancelled_at,
        workers: workersResult.rows.map((w: any) => ({
          id: w.id,
          name: w.name,
          task: w.task,
          status: w.status,
          result: w.result,
          progressLog: w.progress_log,
          tokensUsed: w.tokens_used,
          startedAt: w.started_at,
          completedAt: w.completed_at,
        })),
      });
    }

    // List all runs for user
    const runs = await repo.getUserRuns(user.id, 50);

    return Response.json({
      runs: runs.map(r => ({
        id: r.id,
        status: r.cancelled_at ? 'cancelled' : r.status,
        prompt: r.prompt,
        result: r.result,
        error_message: r.error_message,
        started_at: r.started_at,
        completed_at: r.completed_at,
        cancelled_at: r.cancelled_at,
        llm_model: r.llm_model,
        llm_provider: r.llm_provider,
        workers: r.workers.map(w => ({
          id: w.id,
          name: w.name,
          task: w.task,
          status: w.status,
          result: w.result,
          progressLog: w.progress_log,
          tokensUsed: w.tokens_used,
          startedAt: w.started_at,
          completedAt: w.completed_at,
        })),
      })),
    });
  } catch (error: any) {
    console.error('[AgentRoute] Error fetching run:', error);
    return Response.json({ error: error.message || 'Failed to fetch run' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token')?.value;
    if (!sessionToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await authService.validateSession(sessionToken);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const runId = request.nextUrl.searchParams.get('runId');
    if (!runId) {
      return Response.json({ error: 'runId is required' }, { status: 400 });
    }

    // Verify run belongs to user
    const runResult = await pool.query(
      `SELECT id FROM agent_runs WHERE id = $1 AND user_id = $2`,
      [runId, user.id]
    );

    if (runResult.rows.length === 0) {
      return Response.json({ error: 'Run not found' }, { status: 404 });
    }

    const cancelled = await repo.cancelRun(runId);
    if (!cancelled) {
      return Response.json({ error: 'Run cannot be cancelled (already completed or failed)' }, { status: 409 });
    }

    console.log('[AgentRoute] Cancelled run:', runId);
    return Response.json({ cancelled: true });
  } catch (error: any) {
    console.error('[AgentRoute] Error cancelling run:', error);
    return Response.json({ error: error.message || 'Failed to cancel run' }, { status: 500 });
  }
}
