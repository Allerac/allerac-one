import { ForbiddenError, UnauthorizedError } from '@/app/lib/auth-session';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiData<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): Response {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return Response.json(body, { status });
}

export function apiAuthError(error: unknown): Response | null {
  if (error instanceof UnauthorizedError) {
    return apiError('unauthorized', 'Unauthorized', 401);
  }
  if (error instanceof ForbiddenError) {
    return apiError('forbidden', 'Forbidden', 403);
  }
  return null;
}

export function apiInternalError(context: string, error: unknown): Response {
  console.error(`[ControlApi] ${context}:`, error);
  return apiError('internal_error', 'Internal server error', 500);
}

