import { pairingService } from '@/federation/pairing.instance';
import { requireSessionAdmin } from '../../../_lib/auth';
import { federationErrorResponse } from '../../../_lib/federation';
import { apiData } from '../../../_lib/responses';

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const { id } = await context.params;
    return apiData({ peer: await pairingService.reject({ peerId: id, adminId: admin.id }) });
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/peers/:id/reject failed', error);
  }
}
