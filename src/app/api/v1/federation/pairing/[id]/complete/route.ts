import { acquireOperationLimit, operationLimitResponse } from '@/app/lib/operation-limiter';
import { pairingService } from '@/federation/pairing.instance';
import { pairingCompleteSchema } from '@/federation/peer-client';
import { federationErrorResponse, readJson } from '../../../../_lib/federation';
import { apiData, apiError } from '../../../../_lib/responses';

type Context = { params: Promise<{ id: string }> };

/** The responder finishes a pairing we initiated. Authenticated by the one-time pairing secret. */
export async function POST(request: Request, context: Context): Promise<Response> {
  const limit = acquireOperationLimit('federation-pairing', 'global');
  if (!limit.allowed) return operationLimitResponse(limit);
  try {
    const { id } = await context.params;
    const parsed = pairingCompleteSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid pairing completion', 400);
    return apiData(await pairingService.complete(id, parsed.data));
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/federation/pairing/:id/complete failed', error);
  } finally {
    limit.lease.release();
  }
}
