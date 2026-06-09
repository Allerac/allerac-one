import pool from '@/app/clients/db';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const result = await pool.query(
      user.is_admin
        ? `SELECT slug
           FROM domains
           WHERE is_active = true
           ORDER BY sort_order ASC`
        : `SELECT d.slug
           FROM user_domain_access uda
           JOIN domains d ON d.id = uda.domain_id
           WHERE uda.user_id = $1 AND d.is_active = true
           ORDER BY d.sort_order ASC`,
      user.is_admin ? [] : [user.id]
    );
    const visible = result.rows.map((r: { slug: string }) => r.slug);
    return Response.json({ visible });
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    console.error('[Domains API] Failed to load domains:', error);
    return Response.json({ error: 'Failed to load domains' }, { status: 500 });
  }
}
