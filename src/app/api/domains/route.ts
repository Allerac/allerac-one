import pool from '@/app/clients/db';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT slug FROM domains WHERE is_active = true ORDER BY sort_order ASC`
    );
    const visible = result.rows.map((r: { slug: string }) => r.slug);
    return Response.json({ visible });
  } catch {
    // Fallback if DB query fails
    return Response.json({ visible: ['chat', 'code', 'social', 'health'] });
  }
}
