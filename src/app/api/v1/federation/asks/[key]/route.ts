import { agentsService } from '@/federation/agents.instance';
import { IDEMPOTENCY_KEY } from '@/federation/ask-dedupe';
import { askResultReply } from '@/federation/ask-http';
import { requireApiPrincipal } from '../../../_lib/auth';
import { federationErrorResponse } from '../../../_lib/federation';
import { apiData, apiError } from '../../../_lib/responses';

export const dynamic = 'force-dynamic';

/**
 * A paired Unit reads the result of one of its own asks by Idempotency-Key
 * (federation P4c). Same scope as asking; other principals get 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  try {
    const caller = await requireApiPrincipal('federation:agents:ask', request);
    if (caller.type !== 'service') return apiError('forbidden', 'Forbidden', 403);
    const { key } = await params;
    const decoded = decodeURIComponent(key);
    if (!IDEMPOTENCY_KEY.test(decoded)) return apiError('validation_error', 'Invalid key', 400);
    const state = await agentsService.getAskResult(caller.principal.id, caller.actingUser.id, decoded);
    const reply = askResultReply(state, decoded);
    return apiData(reply.data, { status: reply.status });
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/federation/asks/:key failed', error);
  }
}
