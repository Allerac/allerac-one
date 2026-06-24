import { domainService } from '@/app/services/domains/domain.service';
import { requireApiUser } from '../_lib/auth';
import { domainDto } from '../_lib/domains';
import { apiAuthError, apiData, apiInternalError } from '../_lib/responses';

export async function GET(): Promise<Response> {
  try {
    const user = await requireApiUser('domains:read');
    const domains = await domainService.listAccessible({
      userId: user.id,
      isAdmin: user.isAdmin,
    });

    return apiData({ domains: domains.map(domainDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/domains failed', error);
  }
}
