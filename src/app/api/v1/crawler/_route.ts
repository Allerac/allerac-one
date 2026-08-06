import { ZodError } from 'zod';
import { apiAuthError, apiError, apiInternalError } from '@/app/api/v1/_lib/responses';
import { CrawlerConflictError, CrawlerNotFoundError } from '@/app/services/crawler/crawler.service';

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ZodError([{ code: 'custom', path: [], message: 'Request body must be valid JSON' }]);
  }
}

export function crawlerRouteError(context: string, error: unknown): Response {
  const auth = apiAuthError(error);
  if (auth) return auth;
  if (error instanceof ZodError) {
    return apiError('validation_error', 'Invalid crawler request', 400, error.flatten());
  }
  if (error instanceof CrawlerNotFoundError) return apiError('not_found', error.message, 404);
  if (error instanceof CrawlerConflictError) return apiError('conflict', error.message, 409);
  return apiInternalError(context, error);
}

