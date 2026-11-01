import { z } from 'zod';
import { grantsService } from '@/federation/grants.instance';
import { pairingService } from '@/federation/pairing.instance';
import { requireSessionAdmin } from '../../../_lib/auth';
import { federationErrorResponse, readJson } from '../../../_lib/federation';
import { apiData, apiError } from '../../../_lib/responses';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = z.array(z.string().min(1).max(100)).max(10);
const schema = z.object({ add: ids.optional(), remove: ids.optional() }).strict();

type Context = { params: Promise<{ id: string }> };

/** Adds or removes capabilities on an existing pairing, e.g. "Grant status read" (P4d, admin only, audited). */
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const { id } = await context.params;
    if (!UUID.test(id)) return apiError('not_found', 'Peer not found', 404);
    const parsed = schema.safeParse((await readJson(request)) ?? {});
    if (!parsed.success) return apiError('validation_error', 'Invalid payload', 400, parsed.error.flatten());
    const peer = await grantsService.update({ peerId: id, add: parsed.data.add, remove: parsed.data.remove, adminId: admin.id });
    return apiData({ peer: pairingService.toView(peer) });
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/peers/:id/grants failed', error);
  }
}
