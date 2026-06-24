import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import pool from '@/app/clients/db';
import { ChatService } from '@/app/services/database/chat.service';
import { WorkerRunRepository } from '@/app/services/agents/worker-run.repository';
import { requireApiUser } from '../_lib/auth';
import { agentRunDto } from '../_lib/agent-runs';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';

const chatService = new ChatService();
const repo = new WorkerRunRepository();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createRunSchema = z.object({
  message: z.string().trim().min(1),
  conversationId: z.string().uuid().nullable().optional(),
  model: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  skillName: z.string().trim().min(1).optional(),
});

async function resolveSkillId(skillName: string | undefined, userId: string): Promise<string | null> {
  if (!skillName) return null;

  const result = await pool.query(
    `SELECT id FROM skills
     WHERE name = $1 AND (user_id = $2 OR user_id IS NULL OR is_system = true)
     ORDER BY CASE WHEN user_id = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [skillName, userId],
  );

  return result.rows[0]?.id ?? null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('agents:read', request);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid agent run filters', 400, parsed.error.flatten());
    }

    const runs = await repo.getUserRuns(user.id, parsed.data.limit ?? 50);
    return apiData({ agentRuns: runs.map(agentRunDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/agent-runs failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('agents:write', request);
    const parsed = createRunSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid agent run payload', 400, parsed.error.flatten());
    }

    const message = parsed.data.message;
    let conversationId = parsed.data.conversationId ?? null;

    if (!conversationId) {
      const title = message.slice(0, 50) + (message.length > 50 ? '...' : '');
      conversationId = await chatService.createConversation(user.id, title);
      if (!conversationId) {
        return apiError('internal_error', 'Failed to create conversation', 500);
      }
    } else {
      const conversation = await chatService.getConversationForUser(conversationId, user.id);
      if (!conversation) {
        return apiError('not_found', 'Conversation not found', 404);
      }
    }

    const runId = uuid();
    const skillId = await resolveSkillId(parsed.data.skillName, user.id);
    const model = parsed.data.model || 'qwen2.5:3b';
    const provider = parsed.data.provider || 'ollama';

    await pool.query(
      `INSERT INTO agent_runs (id, conversation_id, user_id, status, prompt, llm_model, llm_provider, skill_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [runId, conversationId, user.id, 'pending', message, model, provider, skillId],
    );

    const savedUserMessage = await chatService.saveMessage(conversationId, 'user', message, { userId: user.id });
    if (!savedUserMessage.success) {
      return apiError('internal_error', 'Failed to save user message', 500);
    }

    const savedAssistantMessage = await chatService.saveMessage(conversationId, 'assistant', '', {
      agentRunId: runId,
      userId: user.id,
    });
    if (!savedAssistantMessage.success) {
      return apiError('internal_error', 'Failed to save assistant message', 500);
    }

    const run = await repo.getRunForUser(runId, user.id);
    return apiData({
      agentRun: run ? agentRunDto({ ...run, workers: [] }) : {
        id: runId,
        conversationId,
        status: 'pending',
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/agent-runs failed', error);
  }
}
