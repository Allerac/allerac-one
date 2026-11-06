import { acquireOperationLimit, operationLimitResponse } from '@/app/lib/operation-limiter';
import { isPairingAccepted } from '@/federation/manifest';
import { pairingService } from '@/federation/pairing.instance';
import { pairingRequestSchema } from '@/federation/peer-client';
import { clientIp, federationErrorResponse, readJson } from '../../_lib/federation';
import { apiData, apiError } from '../../_lib/responses';

/**
 * Receives a pairing request from another Unit. Unauthenticated by design:
 * closed unless pairing is enabled, rate limited, and it only creates a pending
 * request that an admin must accept.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isPairingAccepted()) return apiError('not_found', 'Not found', 404);

  const limit = acquireOperationLimit('federation-pairing', 'global');
  if (!limit.allowed) return operationLimitResponse(limit);
  try {
    const parsed = pairingRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid pairing request', 400);
    const result = await pairingService.receiveRequest(parsed.data, clientIp(request));
    return apiData(result, { status: 202 });
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/federation/pairing failed', error);
  } finally {
    limit.lease.release();
  }
}
