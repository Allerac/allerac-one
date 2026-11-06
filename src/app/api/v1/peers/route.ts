import { z } from 'zod';
import { pairingService } from '@/federation/pairing.instance';
import { requireSessionAdmin } from '../_lib/auth';
import { federationErrorResponse, readJson } from '../_lib/federation';
import { apiData, apiError } from '../_lib/responses';

const initiateSchema = z.object({
  url: z.string().trim().min(1).max(500),
  // Capabilities we grant the peer on this Unit.
  grants: z.array(z.string().min(1).max(100)).max(50),
  // Capabilities we ask the peer for (defaults to everything it advertises).
  requested: z.array(z.string().min(1).max(100)).max(50).optional(),
}).strict();

export async function GET(): Promise<Response> {
  try {
    await requireSessionAdmin();
    return apiData({ peers: await pairingService.list() });
  } catch (error: unknown) {
    return federationErrorResponse('GET /api/v1/peers failed', error);
  }
}

/** Starts pairing with another Unit (this Unit is the initiator). */
export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await requireSessionAdmin();
    const parsed = initiateSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid pairing payload', 400, parsed.error.flatten());
    const peer = await pairingService.initiate({ ...parsed.data, adminId: admin.id });
    return apiData({ peer }, { status: 201 });
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/peers failed', error);
  }
}
