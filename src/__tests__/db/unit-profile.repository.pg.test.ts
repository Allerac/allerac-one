/**
 * @jest-environment node
 *
 * unit_profile round trip on a real, migrated Postgres (migration 150).
 * Enabled with RUN_PG_TESTS=1 and DATABASE_URL (the "DB Integration" CI job).
 */
import pool from '@/app/clients/db';
import { clearUnitProfileCache, loadUnitProfile, loadUnitProfileRow, saveUnitProfile } from '@/federation/unit-profile.repository';

const enabled = process.env.RUN_PG_TESTS === '1' && !!process.env.DATABASE_URL;
const describePg = enabled ? describe : describe.skip;

describePg('unit-profile repository against Postgres', () => {
  let before: Record<string, unknown> | undefined;

  beforeAll(async () => {
    before = (await pool.query('SELECT * FROM unit_profile WHERE id = 1')).rows[0];
  });

  afterAll(async () => {
    await pool.query('DELETE FROM unit_profile WHERE id = 1');
    if (before) {
      await pool.query(
        `INSERT INTO unit_profile (id, display_name, emoji, role, description, tags, agent_descriptions, identity_in_public_domains, instructions)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)`,
        [before.display_name, before.emoji, before.role, before.description, before.tags, before.agent_descriptions,
          before.identity_in_public_domains, before.instructions ?? null],
      );
    }
    await pool.end();
  });

  it('saves and loads instructions, keeping them on partial updates', async () => {
    await saveUnitProfile({ displayName: 'Santos', role: 'research', instructions: 'Always answer in Portuguese.' }, null as unknown as string);
    clearUnitProfileCache();
    expect(await loadUnitProfileRow()).toMatchObject({ displayName: 'Santos', instructions: 'Always answer in Portuguese.' });

    await saveUnitProfile({ role: 'beach research' }, null as unknown as string);
    clearUnitProfileCache();
    expect((await loadUnitProfile()).instructions).toBe('Always answer in Portuguese.');

    await saveUnitProfile({ instructions: null }, null as unknown as string);
    clearUnitProfileCache();
    expect((await loadUnitProfileRow())?.instructions).toBeNull();
  });

  it('enforces the 4000-character limit in the database', async () => {
    await expect(pool.query('UPDATE unit_profile SET instructions = $1 WHERE id = 1', ['x'.repeat(4001)])).rejects.toThrow(/unit_profile_instructions_length/);
  });
});
