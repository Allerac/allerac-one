import { z } from 'zod';
import { agentsService } from '@/federation/agents.instance';
import { FederationRateLimitedError, MAX_QUESTION_CHARS } from '@/federation/agents.service';
import { IDEMPOTENCY_KEY } from '@/federation/ask-dedupe';
import { requireApiPrincipal } from '../../../../_lib/auth';
import { federationErrorResponse, readJson } from '../../../../_lib/federation';
import { apiData, apiError } from '../../../../_lib/responses';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  // P4b continuity: omitted = legacy (shared conversation), null = new conversation.
  conversation_id: z.string().uuid().nullable().optional(),
  thread_title: z.string().trim().max(200).nullable().optional(),
});

/**
 * A paired Unit asks one of this Unit's exposed agents a question. With
 * `conversation_id` the agent continues that conversation (P4b); an
 * `Idempotency-Key` header makes retries replay the stored answer.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  try {
    const caller = await requireApiPrincipal('federation:agents:ask', request);
    if (caller.type !== 'service') return apiError('forbidden', 'Forbidden', 403);
    const { agent } = await params;
    const parsed = bodySchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return apiError('validation_error', `question is required (max ${MAX_QUESTION_CHARS} characters); conversation_id must be a UUID`, 400);
    }
    const idempotencyKey = request.headers.get('idempotency-key');
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return apiError('validation_error', 'Invalid Idempotency-Key', 400);
    }
    const result = await agentsService.ask({
      principalId: caller.principal.id,
      actingUserId: caller.actingUser.id,
      agent: agent.toLowerCase(),
      question: parsed.data.question,
      conversationId: parsed.data.conversation_id,
      threadTitle: parsed.data.thread_title ?? null,
      idempotencyKey,
    });
    return apiData(result);
  } catch (error: unknown) {
    if (error instanceof FederationRateLimitedError) {
      const response = apiError(error.code, error.message, 429);
      for (const [key, value] of Object.entries(error.headers)) response.headers.set(key, value);
      return response;
    }
    return federationErrorResponse('POST /api/v1/federation/agents/:agent/ask failed', error);
  }
}
