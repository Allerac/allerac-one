'use server';

import pool from '@/app/clients/db';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import {
  domainModelSettingsService,
  type DomainModelSettings,
} from '@/app/services/domains/domain-model-settings.service';

export async function getUserAccessibleDomains(): Promise<string[]> {
  try {
    const user = await requireCurrentUser();
    if (user.is_admin) {
      const result = await pool.query(
        `SELECT slug FROM domains WHERE is_active = true ORDER BY created_at ASC`
      );
      return result.rows.map((r: { slug: string }) => r.slug);
    }
    const result = await pool.query(
      `SELECT d.slug FROM domains d
       JOIN user_domain_access uda ON uda.domain_id = d.id
       WHERE uda.user_id = $1 AND d.is_active = true
       ORDER BY d.created_at ASC`,
      [user.id]
    );
    return result.rows.map((r: { slug: string }) => r.slug);
  } catch {
    return [];
  }
}

export async function getDomainModelSettings(domainSlug: string) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, domainSlug);
  return domainModelSettingsService.get(user.id, domainSlug);
}

export async function saveDomainModelSettings(settings: DomainModelSettings) {
  const user = await requireCurrentUser();
  await assertDomainAccess(user, settings.domainSlug);
  await domainModelSettingsService.set(user.id, settings);
  return { success: true };
}
