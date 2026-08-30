import pool from '@/app/clients/db';

export interface DomainDefaultSkill {
  id: string;
  name: string;
  displayName: string | null;
}

export interface DomainSummary {
  slug: string;
  displayName: string;
  isActive: boolean;
  defaultSkill: DomainDefaultSkill | null;
}

function rowToDomain(row: Record<string, unknown>): DomainSummary {
  const skillId = row.skill_id as string | null;

  return {
    slug: row.slug as string,
    displayName: row.display_name as string,
    isActive: row.is_active as boolean,
    defaultSkill: skillId
      ? {
          id: skillId,
          name: row.skill_name as string,
          displayName: row.skill_display_name as string | null,
        }
      : null,
  };
}

export interface DomainOwner {
  id: string;
  email: string;
}

export class DomainService {
  /**
   * The single non-admin service account granted access to this domain — used by
   * public-facing "external agent" domains (sales, openworld) where exactly one
   * dedicated bot account exists per domain (see docs/domains/expose-agent-to-website.md).
   * Settings keyed by user_id (model config, rate-limit usage) are only meaningful
   * against this account, not whichever admin happens to be viewing the page — see
   * the "admin bypass trap" note in that doc. Returns null if no such account exists
   * (not yet provisioned) or if access was granted to more than one account (not the
   * expected shape for this kind of domain; picks the oldest grant deterministically
   * rather than guessing).
   */
  async findDomainOwner(domainSlug: string): Promise<DomainOwner | null> {
    const result = await pool.query(
      `SELECT u.id, u.email
       FROM user_domain_access uda
       JOIN domains d ON d.id = uda.domain_id
       JOIN users u ON u.id = uda.user_id
       WHERE d.slug = $1 AND u.is_admin = false
       ORDER BY uda.created_at ASC
       LIMIT 1`,
      [domainSlug],
    );
    const row = result.rows[0];
    return row ? { id: row.id, email: row.email } : null;
  }

  async listAccessible(input: { userId: string; isAdmin: boolean }): Promise<DomainSummary[]> {
    const result = await pool.query(
      input.isAdmin
        ? `SELECT
             d.slug,
             d.display_name,
             d.is_active,
             dsd.skill_id,
             s.name AS skill_name,
             s.display_name AS skill_display_name
           FROM domains d
           LEFT JOIN domain_skill_defaults dsd ON dsd.domain_slug = d.slug
           LEFT JOIN skills s ON s.id = dsd.skill_id
           WHERE d.is_active = true
           ORDER BY d.sort_order ASC, d.created_at ASC`
        : `SELECT
             d.slug,
             d.display_name,
             d.is_active,
             dsd.skill_id,
             s.name AS skill_name,
             s.display_name AS skill_display_name
           FROM user_domain_access uda
           JOIN domains d ON d.id = uda.domain_id
           LEFT JOIN domain_skill_defaults dsd ON dsd.domain_slug = d.slug
           LEFT JOIN skills s ON s.id = dsd.skill_id
           WHERE uda.user_id = $1 AND d.is_active = true
           ORDER BY d.sort_order ASC, d.created_at ASC`,
      input.isAdmin ? [] : [input.userId],
    );

    return result.rows.map(rowToDomain);
  }
}

export const domainService = new DomainService();
