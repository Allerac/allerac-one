import { assertDomainAccess, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';
import { apiKeyService, type ServicePrincipalRef } from '@/app/services/api-keys/api-key.service';
import { ForbiddenError } from '@/app/lib/auth-session';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  authMode: 'session' | 'api_key' | 'service_key';
}

/** Who is calling: a person (session or personal key) or a service principal. */
export type ApiPrincipal =
  | { type: 'user'; user: ApiUser }
  | { type: 'service'; principal: ServicePrincipalRef; actingUser: ApiUser };

function bearerTokenFromRequest(request?: Request): string | null {
  const authorization = request?.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Resolves the caller for a scoped Control API request. Service principals act
 * as their configured local user but never carry admin rights.
 */
export async function requireApiPrincipal(scope: string, request?: Request): Promise<ApiPrincipal> {
  const bearerToken = bearerTokenFromRequest(request);

  if (!bearerToken) {
    const user: User = await requireCurrentUser();
    if (!user) throw new UnauthorizedError();
    return { type: 'user', user: toApiUser(user, 'session') };
  }

  const user = await apiKeyService.validateBearerToken(bearerToken, scope);
  if (!user) throw new UnauthorizedError();

  if (user.principal) {
    return {
      type: 'service',
      principal: user.principal,
      actingUser: { ...toApiUser(user, 'service_key'), isAdmin: false },
    };
  }
  return { type: 'user', user: toApiUser(user, 'api_key') };
}

export async function requireApiUser(scope: string, request?: Request): Promise<ApiUser> {
  const principal = await requireApiPrincipal(scope, request);
  return principal.type === 'service' ? principal.actingUser : principal.user;
}

/** Session-only admin check; never satisfied by an API or service key. */
export async function requireSessionAdmin(): Promise<ApiUser> {
  const user = await requireSessionApiUser('admin');
  if (!user.isAdmin) throw new ForbiddenError('Admin access required');
  return user;
}

function toApiUser(user: User, authMode: ApiUser['authMode']): ApiUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin,
    authMode,
  };
}

export async function requireSessionApiUser(_scope: string): Promise<ApiUser> {
  const user: User = await requireCurrentUser();
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin,
    authMode: 'session',
  };
}

export async function requireApiDomainUser(scope: string, domainSlug: string, request?: Request): Promise<ApiUser> {
  const apiUser = await requireApiUser(scope, request);
  await assertDomainAccess({
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name,
    is_admin: apiUser.isAdmin,
    created_at: new Date(),
  }, domainSlug);
  return apiUser;
}
