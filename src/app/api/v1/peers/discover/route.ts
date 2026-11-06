import { z } from 'zod';
import { pairingService } from '@/federation/pairing.instance';
import { requireSessionAdmin } from '../../_lib/auth';
import { federationErrorResponse, readJson } from '../../_lib/federation';
import { apiData, apiError } from '../../_lib/responses';

const schema = z.object({ url: z.string().trim().min(1).max(500) }).strict();

/** Reads and validates another Unit's manifest. Creates nothing. */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSessionAdmin();
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return apiError('validation_error', 'Invalid payload', 400, parsed.error.flatten());
    return apiData(await pairingService.discover(parsed.data.url));
  } catch (error: unknown) {
    return federationErrorResponse('POST /api/v1/peers/discover failed', error);
  }
}
