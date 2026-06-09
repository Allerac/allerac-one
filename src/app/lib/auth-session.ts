import { cookies } from 'next/headers';
import { AuthService, User } from '@/app/services/auth/auth.service';

const authService = new AuthService();
const SESSION_COOKIE_NAME = 'session_token';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function authenticationErrorResponse(
  error: unknown,
  options: { format?: 'json' | 'text' } = {},
): Response | null {
  const response = (message: string, status: number) => (
    options.format === 'text'
      ? new Response(message, { status })
      : Response.json({ error: message }, { status })
  );

  if (error instanceof UnauthorizedError) {
    return response('Unauthorized', 401);
  }
  if (error instanceof ForbiddenError) {
    return response('Forbidden', 403);
  }
  return null;
}

export async function requireCurrentUser(): Promise<User> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) throw new UnauthorizedError();

  const user = await authService.validateSession(token);
  if (!user) throw new UnauthorizedError();

  return user;
}

export async function requireCurrentAdmin(): Promise<User> {
  const user = await requireCurrentUser();
  if (!user.is_admin) throw new ForbiddenError('Admin access required');
  return user;
}

export async function assertDomainAccess(user: User, domainSlug: string): Promise<void> {
  const allowed = await authService.canAccessDomain(user.id, user.is_admin, domainSlug);
  if (!allowed) throw new ForbiddenError('Domain access denied');
}
