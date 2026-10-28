import { federationAuditRepository } from '@/federation/audit.repository';
import { requireSessionAdmin } from '../../../_lib/auth';
import { federationErrorResponse } from '../../../_lib/federation';
import { apiData, apiError } from '../../../_lib/responses';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

/** Recent federation calls to and from one peer (admin only). */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    await requireSessionAdmin();
    const { id } = await context.params;
    if (!UUID.test(id)) return apiError('not_found', 'Peer not found', 404);
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50);
    const entries = await federationAuditRepository.listForPeer(id, Number.isFinite(limit) ? limit : 50);
    return apiData({ entries });
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/peers/:id/audit failed', error);
  }
}
