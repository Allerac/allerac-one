import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiData, apiInternalError } from '../_lib/responses';
import { CapabilitiesService } from '@/app/services/capabilities/capabilities.service';

const capabilitiesService = new CapabilitiesService();

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('capabilities:read', request);
    const result = await capabilitiesService.loadForUser(user.id);
    return apiData(result);
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/capabilities failed', error);
  }
}
