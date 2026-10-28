import { z } from 'zod';
import { agentsService } from '@/federation/agents.instance';
import { FederationRateLimitedError, MAX_QUESTION_CHARS } from '@/federation/agents.service';
import { requireApiPrincipal } from '../../../../_lib/auth';
import { federationErrorResponse, readJson } from '../../../../_lib/federation';
import { apiData, apiError } from '../../../../_lib/responses';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({ question: z.string().trim().min(1).max(MAX_QUESTION_CHARS) });

/** A paired Unit asks one of this Unit's exposed agents a question. */
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
      return apiError('validation_error', `question is required (max ${MAX_QUESTION_CHARS} characters)`, 400);
    }
    const result = await agentsService.ask({
      principalId: caller.principal.id,
      actingUserId: caller.actingUser.id,
      agent: agent.toLowerCase(),
      question: parsed.data.question,
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
