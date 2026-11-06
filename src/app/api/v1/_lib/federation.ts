import { FederationError } from '@/federation/errors';
import { apiAuthError, apiError, apiInternalError } from './responses';

/** Maps federation, auth, and unexpected errors to Control API envelopes. */
export function federationErrorResponse(context: string, error: unknown): Response {
  if (error instanceof FederationError) return apiError(error.code, error.message, error.status);
  const authError = apiAuthError(error);
  if (authError) return authError;
  return apiInternalError(context, error);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function clientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}
