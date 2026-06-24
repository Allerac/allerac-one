import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import type { User } from '@/app/services/auth/auth.service';

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  authMode: 'session';
}

export async function requireApiUser(_scope: string): Promise<ApiUser> {
  const user: User = await requireCurrentUser();

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.is_admin,
    authMode: 'session',
  };
}

export async function requireApiDomainUser(scope: string, domainSlug: string): Promise<ApiUser> {
  const apiUser = await requireApiUser(scope);
  await assertDomainAccess({
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name,
    is_admin: apiUser.isAdmin,
    created_at: new Date(),
  }, domainSlug);
  return apiUser;
}

