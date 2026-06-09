/**
 * /api/agents — Background agent execution with Postgres queue
 *
 * POST /api/agents — Create a new agent run, returns { runId } immediately
 * GET  /api/agents?runId=... — Poll for single run status and results
 * GET  /api/agents — List all runs for current user
 * DELETE /api/agents?runId=... — Cancel a running agent
 */

import { NextRequest } from 'next/server';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ChatService } from '@/app/services/database/chat.service';
import { WorkerRunRepository } from '@/app/services/agents/worker-run.repository';
import pool from '@/app/clients/db';
import { v4 as uuid } from 'uuid';

const chatService = new ChatService();
const repo = new WorkerRunRepository();

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const { message, conversationId: inputConversationId, model, provider, skillName }: {
      message: string;
      conversationId: string | null;
      model: string;
      provider: string;
      skillName?: string;
    } = body;

    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 });
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
    } else {
      const conversation = await chatService.getConversationForUser(convId, userId);
      if (!conversation) {
        return Response.json({ error: 'Conversation not found' }, { status: 404 });
      }
    }

    // Resolve skill name → skill_id if provided
    let skillId: string | null = null;
    if (skillName) {
      const skillResult = await pool.query(
        `SELECT id FROM skills
         WHERE name = $1 AND (user_id = $2 OR user_id IS NULL OR is_system = true)
         ORDER BY CASE WHEN user_id = $2 THEN 0 ELSE 1 END
         LIMIT 1`,
        [skillName, userId]
      );
      skillId = skillResult.rows[0]?.id ?? null;
      if (skillId) console.log(`[AgentRoute] Resolved skill "${skillName}" → ${skillId}`);
      else console.warn(`[AgentRoute] Skill "${skillName}" not found, running without skill`);
    }

    // Create agent_run with pending status (worker picks it up)
    const runId = uuid();
    await pool.query(
      `INSERT INTO agent_runs (id, conversation_id, user_id, status, prompt, llm_model, llm_provider, skill_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [runId, convId, userId, 'pending', message, llmModel, llmProvider, skillId]
    );

    // Save user message to conversation
    const savedUserMessage = await chatService.saveMessage(convId, 'user', message, { userId });
    if (!savedUserMessage.success) {
      return Response.json({ error: 'Failed to save user message' }, { status: 500 });
    }

    // Save assistant placeholder message with agent_run_id so it persists across navigation
    const savedAssistantMessage = await chatService.saveMessage(convId, 'assistant', '', { agentRunId: runId, userId });
    if (!savedAssistantMessage.success) {
      return Response.json({ error: 'Failed to save assistant message' }, { status: 500 });
    }

    console.log('[AgentRoute] Created pending run:', runId);
    return Response.json({ runId });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : 'Failed to create agent run';
    console.error('[AgentRoute] Error creating run:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const runId = request.nextUrl.searchParams.get('runId');

    // Single run detail
    if (runId) {
      const run = await repo.getRunForUser(runId, user.id);
      if (!run) {
        return Response.json({ error: 'Run not found' }, { status: 404 });
      }

      const workers = await repo.getRunWorkersForUser(runId, user.id);

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
        workers: workers.map(w => ({
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
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : 'Failed to fetch run';
    console.error('[AgentRoute] Error fetching run:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const user = await requireCurrentUser();

    const runId = request.nextUrl.searchParams.get('runId');
    if (!runId) {
      return Response.json({ error: 'runId is required' }, { status: 400 });
    }

    const cancelled = await repo.cancelRunForUser(runId, user.id);
    if (!cancelled) {
      return Response.json({ error: 'Run not found or cannot be cancelled' }, { status: 404 });
    }

    console.log('[AgentRoute] Cancelled run:', runId);
    return Response.json({ cancelled: true });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    const message = error instanceof Error ? error.message : 'Failed to cancel run';
    console.error('[AgentRoute] Error cancelling run:', error);
    return Response.json({ error: message }, { status: 500 });
  }
}
