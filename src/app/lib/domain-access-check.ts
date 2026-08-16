import pool from '@/app/clients/db';
import { ForbiddenError } from '@/app/lib/auth-errors';

export interface DomainAccessUser {
  id: string;
  is_admin: boolean;
}

/**
 * Runtime-neutral domain authorization check.
 *
 * Keep this module free of Next.js session and password dependencies so it can
 * be safely bundled into background runtimes such as the Telegram bot.
 */
export async function assertDomainAccess(user: DomainAccessUser, domainSlug: string): Promise<void> {
  if (user.is_admin) return;

  const result = await pool.query(
    `SELECT 1
     FROM user_domain_access uda
     JOIN domains d ON uda.domain_id = d.id
     WHERE uda.user_id = $1 AND d.slug = $2 AND d.is_active = true
     LIMIT 1`,
    [user.id, domainSlug],
  );

  if (result.rows.length === 0) {
    throw new ForbiddenError('Domain access denied');
  }
}
