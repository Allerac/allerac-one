import { servicePrincipalService } from '@/app/services/service-principals/service-principal.service';
import { requireSessionAdmin } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { servicePrincipalDto } from '../_lib';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  try {
    await requireSessionAdmin();
    const { id } = await context.params;
    const principal = await servicePrincipalService.get(id);
    if (!principal) return apiError('not_found', 'Service principal not found', 404);
    return apiData({ servicePrincipal: servicePrincipalDto(principal) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/service-principals/:id failed', error);
  }
}

/** Disables the principal. Its keys stop authenticating immediately. */
export async function DELETE(_request: Request, context: Context): Promise<Response> {
  try {
    await requireSessionAdmin();
    const { id } = await context.params;
    const disabled = await servicePrincipalService.disable(id);
    if (!disabled) return apiError('not_found', 'Service principal not found', 404);
    return apiData({ disabled: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('DELETE /api/v1/service-principals/:id failed', error);
  }
}
