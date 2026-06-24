import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { requireSessionApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireSessionApiUser('api_keys:write');
    const { id } = await context.params;
    const revoked = await apiKeyService.revoke({ userId: user.id, keyId: id });
    if (!revoked) {
      return apiError('not_found', 'API key not found', 404);
    }
    return apiData({ revoked: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/api-keys/:id failed', error);
  }
}
