import pool from '@/app/clients/db';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireApiUser('health:write', request);
    const { id } = await context.params;

    const res = await pool.query(
      'DELETE FROM health_protected_locations WHERE user_id = $1 AND id = $2',
      [user.id, id],
    );
    if ((res.rowCount ?? 0) === 0) {
      return apiError('not_found', 'Protected location not found', 404);
    }

    return apiData({ id, deleted: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/health/protected-locations/:id failed', error);
  }
}
