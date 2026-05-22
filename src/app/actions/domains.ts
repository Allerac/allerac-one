'use server';

import pool from '@/app/clients/db';

export async function getUserAccessibleDomains(userId: string, isAdmin: boolean): Promise<string[]> {
  try {
    if (isAdmin) {
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
      [userId]
    );
    return result.rows.map((r: { slug: string }) => r.slug);
  } catch {
    return [];
  }
}
