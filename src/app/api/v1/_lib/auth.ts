import { assertDomainAccess, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  authMode: 'session' | 'api_key';
}

function bearerTokenFromRequest(request?: Request): string | null {
  const authorization = request?.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireApiUser(_scope: string, request?: Request): Promise<ApiUser> {
  const bearerToken = bearerTokenFromRequest(request);
  let authMode: ApiUser['authMode'] = 'session';
  let user: User | null = null;

  if (bearerToken) {
    user = await apiKeyService.validateBearerToken(bearerToken, _scope);
    authMode = 'api_key';
  } else {
    user = await requireCurrentUser();
  }

  if (!user) {
    throw new UnauthorizedError();
  }

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
