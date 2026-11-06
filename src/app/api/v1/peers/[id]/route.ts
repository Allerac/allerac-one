import { pairingService } from '@/federation/pairing.instance';
import { requireSessionAdmin } from '../../_lib/auth';
import { federationErrorResponse } from '../../_lib/federation';
import { apiData } from '../../_lib/responses';

type Context = { params: Promise<{ id: string }> };

/** Revokes an active pairing or cancels a pending one. */
export async function DELETE(_request: Request, context: Context): Promise<Response> {
  try {
    await requireSessionAdmin();
    const { id } = await context.params;
    return apiData({ peer: await pairingService.revoke({ peerId: id }) });
  } catch (error: unknown) {
    return federationErrorResponse('DELETE /api/v1/peers/:id failed', error);
  }
}
