/**
 * @jest-environment node
 *
 * Migration 156 (sales -> alleracweb) on a real, migrated Postgres. The data is
 * seeded and the migration re-applied inside a transaction that is rolled back.
 * Enabled with RUN_PG_TESTS=1 and DATABASE_URL (the "DB Integration" CI job).
 */
import { readFileSync } from 'fs';
import path from 'path';
import pool from '@/app/clients/db';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

const MIGRATION = readFileSync(
  path.join(process.cwd(), 'src/database/migrations/156_rename_sales_to_alleracweb.sql'),
  'utf8',
);

describePg('migration 156: rename sales domain to alleracweb', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('moves the domain, access, settings and conversations, and is idempotent', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM domains WHERE slug IN ('sales', 'alleracweb')`);
      await client.query(`INSERT INTO domains (slug, display_name, is_active, sort_order) VALUES ('sales', 'Sales', true, 20)`);
      const bot = (await client.query(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, 'bot', 'x') RETURNING id`,
        [`sales-bot-${Date.now()}@example.test`],
      )).rows[0].id;
      await client.query(
        `INSERT INTO user_domain_access (user_id, domain_id) SELECT $1, id FROM domains WHERE slug = 'sales'`, [bot],
      );
      await client.query(`INSERT INTO domain_rate_limit_settings (domain_slug, daily_requests) VALUES ('sales', 42)`);
      await client.query(
        `INSERT INTO user_domain_model_settings (user_id, domain_slug, model_id) VALUES ($1, 'sales', 'm1')`, [bot],
      );
      const conv = (await client.query(
        `INSERT INTO chat_conversations (user_id, title, domain_slug) VALUES ($1, 'Visitor', 'sales') RETURNING id`, [bot],
      )).rows[0].id;
      await client.query(
        `INSERT INTO control_api_keys (user_id, name, token_prefix, token_hash, scopes)
         VALUES ($1, 'widget', 'pfx', $2, ARRAY['chat:write'])`,
        [bot, `hash-${Date.now()}`],
      );

      await client.query(MIGRATION);
      await client.query(MIGRATION); // idempotent

      const domains = (await client.query(
        `SELECT slug, display_name, is_active, sort_order FROM domains WHERE slug IN ('sales', 'alleracweb')`,
      )).rows;
      expect(domains).toEqual([{ slug: 'alleracweb', display_name: 'Allerac Web', is_active: true, sort_order: 20 }]);

      const access = (await client.query(
        `SELECT d.slug FROM user_domain_access a JOIN domains d ON d.id = a.domain_id WHERE a.user_id = $1`, [bot],
      )).rows;
      expect(access).toEqual([{ slug: 'alleracweb' }]);
      expect((await client.query(
        `SELECT daily_requests FROM domain_rate_limit_settings WHERE domain_slug = 'alleracweb'`,
      )).rows).toEqual([{ daily_requests: 42 }]);
      expect((await client.query(
        `SELECT model_id FROM user_domain_model_settings WHERE user_id = $1 AND domain_slug = 'alleracweb'`, [bot],
      )).rows).toEqual([{ model_id: 'm1' }]);
      expect((await client.query(`SELECT domain_slug FROM chat_conversations WHERE id = $1`, [conv])).rows)
        .toEqual([{ domain_slug: 'alleracweb' }]);
      expect((await client.query(
        `SELECT count(*)::int AS n FROM control_api_keys WHERE user_id = $1 AND revoked_at IS NULL`, [bot],
      )).rows[0].n).toBe(1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
