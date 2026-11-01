import { agentsService } from '@/federation/agents.instance';
import { ASYNC_POLL_AFTER_MS, IDEMPOTENCY_KEY } from '@/federation/ask-dedupe';
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
    if (state.status === 'done') return apiData({ status: 'done', ...state.response });
    if (state.status === 'pending') {
      return apiData({ status: 'pending', key: decoded, poll_after_ms: ASYNC_POLL_AFTER_MS }, { status: 202 });
    }
    return apiData({ status: 'failed', error_code: state.errorCode });
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/federation/asks/:key failed', error);
  }
}
