import { z } from 'zod';
import { pairingService } from '@/federation/pairing.instance';
import { requireSessionAdmin } from '../../../_lib/auth';
import { federationErrorResponse, readJson } from '../../../_lib/federation';
import { apiData, apiError } from '../../../_lib/responses';

const schema = z.object({
  // Capabilities granted to the peer; defaults to what it requested.
  grants: z.array(z.string().min(1).max(100)).max(50).optional(),
}).strict();

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const { id } = await context.params;
    const parsed = schema.safeParse((await readJson(request)) ?? {});
    if (!parsed.success) return apiError('validation_error', 'Invalid payload', 400, parsed.error.flatten());
    const peer = await pairingService.accept({ peerId: id, grants: parsed.data.grants, adminId: admin.id });
    return apiData({ peer });
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/peers/:id/accept failed', error);
  }
}
